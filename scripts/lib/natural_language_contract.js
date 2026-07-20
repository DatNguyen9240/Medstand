'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const intentMap = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'natural-language', 'intent-map.v1.json'),
  'utf8'
));
const parserSchema = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'natural-language', 'parser-output.schema.json'),
  'utf8'
));

const INTERNAL_INTENTS = new Set(Object.keys(intentMap.intents));
const PARSER_INTENTS = new Set([...INTERNAL_INTENTS, 'CASUAL_CHAT']);
const ENTITY_KEYS = new Set(Object.keys(parserSchema.properties.entities.properties));
const ROOT_KEYS = new Set(Object.keys(parserSchema.properties));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateParserOutput(value) {
  const errors = [];
  if (!isPlainObject(value)) return { ok: false, errors: ['output must be an object'] };

  for (const key of parserSchema.required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!ROOT_KEYS.has(key)) errors.push(`unexpected property ${key}`);
  }
  if (value.internalIntent !== null && !PARSER_INTENTS.has(value.internalIntent)) {
    errors.push('internalIntent is not allowlisted');
  }
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)
      || value.confidence < 0 || value.confidence > 1) {
    errors.push('confidence must be between 0 and 1');
  }
  if (!isPlainObject(value.entities)) {
    errors.push('entities must be an object');
  } else {
    for (const [key, entityValue] of Object.entries(value.entities)) {
      if (!ENTITY_KEYS.has(key)) errors.push(`unexpected entity ${key}`);
      if (entityValue !== null && !['string', 'number'].includes(typeof entityValue)) {
        errors.push(`invalid entity type ${key}`);
      }
    }
  }
  if (!Array.isArray(value.missingFields)
      || value.missingFields.some((entry) => typeof entry !== 'string')) {
    errors.push('missingFields must be a string array');
  }
  if (typeof value.requiresClarification !== 'boolean') {
    errors.push('requiresClarification must be boolean');
  }
  if (value.alternatives !== undefined) {
    if (!Array.isArray(value.alternatives) || value.alternatives.length > 3) {
      errors.push('alternatives must contain at most 3 entries');
    } else {
      for (const alternative of value.alternatives) {
        if (!isPlainObject(alternative)
            || !PARSER_INTENTS.has(alternative.internalIntent)
            || typeof alternative.confidence !== 'number') {
          errors.push('invalid alternative');
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function mapInternalIntent(internalIntent) {
  if (internalIntent === 'CASUAL_CHAT') {
    return { apiCode: null, risk: 'CASUAL', threshold: null, requiredEntities: [] };
  }
  const mapping = intentMap.intents[internalIntent];
  if (!mapping) return null;
  return {
    ...mapping,
    threshold: intentMap.confidenceThresholds[mapping.risk]
  };
}

function decideParserResult(value) {
  const validation = validateParserOutput(value);
  if (!validation.ok) {
    return { decision: 'BLOCK', code: 'PARSER_SCHEMA_INVALID', validation };
  }
  const mapping = mapInternalIntent(value.internalIntent);
  if (!mapping) return { decision: 'BLOCK', code: 'INTENT_NOT_ALLOWLISTED', validation };
  if (value.internalIntent === 'CASUAL_CHAT') {
    return { decision: 'CASUAL', code: 'CASUAL_CHAT', mapping, validation };
  }
  if (mapping.risk === 'MEDICAL') {
    return { decision: 'CLARIFY', code: 'MEDICAL_OWNER_GATE_REQUIRED', mapping, validation };
  }
  const missing = mapping.requiredEntities.filter((key) => {
    const entity = value.entities[key];
    return entity === undefined || entity === null || String(entity).trim() === '';
  });
  if (value.requiresClarification || value.missingFields.length || missing.length) {
    return { decision: 'CLARIFY', code: 'REQUIRED_ENTITY_MISSING', missing, mapping, validation };
  }
  const alternatives = Array.isArray(value.alternatives) ? value.alternatives : [];
  const second = alternatives
    .filter((entry) => entry.internalIntent !== value.internalIntent)
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (second && value.confidence - second.confidence < intentMap.minimumTopTwoMargin) {
    return { decision: 'CLARIFY', code: 'INTENT_MARGIN_TOO_SMALL', mapping, validation };
  }
  if (value.confidence < mapping.threshold) {
    return { decision: 'CLARIFY', code: 'CONFIDENCE_BELOW_RISK_THRESHOLD', mapping, validation };
  }
  return { decision: 'RUN', code: 'OK', apiCode: mapping.apiCode, mapping, validation };
}

function assertIdentifier(value, label, minimumTailLength = 7) {
  const text = String(value || '').trim();
  const pattern = minimumTailLength === 0
    ? /^[A-Za-z0-9][A-Za-z0-9._@:-]{0,127}$/
    : /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
  if (!pattern.test(text)) {
    throw new Error(`${label}_INVALID`);
  }
  return text;
}

function buildContextKey({ verifiedUserId, conversationId, serverSessionId }) {
  const material = [
    assertIdentifier(verifiedUserId, 'VERIFIED_USER_ID', 0),
    assertIdentifier(conversationId, 'CONVERSATION_ID'),
    assertIdentifier(serverSessionId, 'SERVER_SESSION_ID')
  ].join('\u001f');
  return `ctx_v1_${crypto.createHash('sha256').update(material, 'utf8').digest('hex')}`;
}

function isContextExpired(context, now = Date.now(), options = {}) {
  const idleTtlMs = options.idleTtlMs || 2 * 60 * 60 * 1000;
  const absoluteTtlMs = options.absoluteTtlMs || 12 * 60 * 60 * 1000;
  if (!isPlainObject(context)) return true;
  const createdAt = Number(context.createdAt || 0);
  const lastActiveAt = Number(context.lastActiveAt || 0);
  if (!createdAt || !lastActiveAt) return true;
  return now - lastActiveAt > idleTtlMs || now - createdAt > absoluteTtlMs;
}

const NON_COMMIT_STATUSES = new Set([
  'OUT_OF_SCOPE', 'VALIDATION_ERROR', 'SYSTEM_ERROR', 'AUTH_ERROR',
  'PARSER_SCHEMA_INVALID', 'INTENT_NOT_ALLOWLISTED'
]);

function commitContext(current, proposal, result, expectedVersion) {
  const currentVersion = Number(current?.contextVersion || 0);
  if (currentVersion !== Number(expectedVersion || 0)) {
    return { committed: false, code: 'CONTEXT_VERSION_CONFLICT', context: current };
  }
  const status = String(result?.status || '').toUpperCase();
  if (NON_COMMIT_STATUSES.has(status) || result?.success === false) {
    return { committed: false, code: 'RESULT_NOT_COMMITTABLE', context: current };
  }
  if (!['SUCCESS', 'NO_DATA'].includes(status)) {
    return { committed: false, code: 'RESULT_STATUS_UNKNOWN', context: current };
  }
  const now = Number(result.completedAt || Date.now());
  const base = isPlainObject(current) ? current : {};
  return {
    committed: true,
    code: 'COMMITTED',
    context: {
      ...base,
      ...proposal,
      contextVersion: currentVersion + 1,
      createdAt: Number(base.createdAt || now),
      lastActiveAt: now
    }
  };
}

module.exports = {
  intentMap,
  parserSchema,
  validateParserOutput,
  mapInternalIntent,
  decideParserResult,
  buildContextKey,
  isContextExpired,
  commitContext
};
