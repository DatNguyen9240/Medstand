'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'sql', 'NOTI-001_Notification_Schema_AI.sql'), 'utf8');
const distribution = fs.readFileSync(path.join(root, 'sql', 'NOTI-001_Notification_Distribution_AI.sql'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'sql', 'NOTI-001_Notification_Admin_AI.sql'), 'utf8');
const push = fs.readFileSync(path.join(root, 'sql', 'NOTI-001_Notification_Push_AI.sql'), 'utf8');
const home = fs.readFileSync(path.join(root, 'src', 'js', 'pages', 'home.js'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'src', 'js', 'pages', 'notifications.js'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src', 'js', 'core', 'router.js'), 'utf8');
const http = fs.readFileSync(path.join(root, 'src', 'js', 'services', 'http.js'), 'utf8');
const env = fs.readFileSync(path.join(root, 'env.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pushService = fs.readFileSync(path.join(root, 'src', 'js', 'services', 'notification-push.service.js'), 'utf8');

const tables = [
  'AI_NotificationTbl',
  'AI_NotificationBranchScopeTbl',
  'AI_NotificationUserGroupScopeTbl',
  'AI_NotificationUserScopeTbl',
  'AI_NotificationReadLogTbl',
  'AI_NotificationAuditLogTbl',
];

const checks = [
  ['SHADOW_TABLES', tables.every((name) => schema.includes(name))],
  ['STATUS_CONSTRAINT', schema.includes("Status IN ('DRAFT', 'APPROVED', 'WITHDRAWN')")],
  ['UTC_EFFECTIVE_RANGE', schema.includes('EffectiveFromUtc') && schema.includes('EffectiveToUtc > EffectiveFromUtc')],
  ['THREE_SCOPE_AXES', ['BranchScopeMode', 'UserGroupScopeMode', 'UserScopeMode'].every((name) => schema.includes(name))],
  ['IDEMPOTENT_READ_LOG', schema.includes('PRIMARY KEY (NotificationID, UserName)')],
  ['ACTIVE_USER_FUNCTION', distribution.includes('AI_ActiveNotificationByUserFnc') && distribution.includes('COALESCE(U.Disable, 0) = 0')],
  ['APPROVED_ACTIVE_ONLY', distribution.includes("N.Status = 'APPROVED'") && distribution.includes('N.EffectiveFromUtc <=')],
  ['BRANCH_SCOPE_MATCH', distribution.includes('B.BranchID = U.BranchID')],
  ['GROUP_SCOPE_MATCH', distribution.includes('G.UserGroupID = U.UserGroupID')],
  ['USER_SCOPE_MATCH', distribution.includes('S.UserName = U.UserName')],
  ['API_THONGBAO_AI', distribution.includes('PROCEDURE dbo.API_ThongBao_AI')],
  ['API_THONGBAO_UNREAD_COUNT_AI', distribution.includes('PROCEDURE dbo.API_ThongBao_UnreadCount_AI')],
  ['UNREAD_COUNT_ACTION', distribution.includes("@Action = 'UNREAD_COUNT'")],
  ['MARK_READ_LOCKED', distribution.includes('WITH (UPDLOCK, HOLDLOCK)')],
  ['ADMIN_LIFECYCLE', admin.includes('API_ThongBao_Admin_AI')
    && admin.includes("'CREATE_DRAFT'") && admin.includes("'UPDATE_DRAFT'")
    && admin.includes("'APPROVE'") && admin.includes("'WITHDRAW'")],
  ['ADMIN_SCOPE_FAIL_CLOSED', admin.includes('A SELECTED notification scope cannot be empty.')],
  ['PAGE_LIMIT', distribution.includes('@PageSize BETWEEN 1 AND 100')],
  ['NO_ERP_MUTATION', !/(INSERT\s+(?:INTO\s+)?|UPDATE|DELETE\s+FROM|MERGE\s+(?:INTO\s+)?)dbo\.(AR_|CF_|IV_|SY_)/i.test(schema + distribution)],
  ['NOTIFICATION_API_CONFIGURED', env.includes("LIST: '/api/API_ThongBao_AI'")
    && env.includes("DETAIL: '/api/API_ThongBao_AI'")
    && env.includes("MARK_READ: '/api/API_ThongBao_AI'")],
  ['BADGE_ENDPOINT_CONFIGURED', env.includes("UNREAD_COUNT: '/api/API_ThongBao_UnreadCount_AI'")],
  ['BADGE_BYPASSES_CACHE', home.includes('{ cache: false }') && router.includes('{ cache: false }')],
  ['NO_MISSING_HERO_BADGE', !home.includes('hero-notif-badge')],
  ['URGENT_NOTIFICATION_ONCE_PER_SESSION', home.includes('loadUrgentNotification')
    && home.includes('sessionStorage.getItem(sessionKey)')
    && home.includes('Priority ?? record.priority')],
  ['HTTP_OPTIONAL_CACHE', http.includes('options.cache !== false')],
  ['SERVER_OWNED_NOTIFICATION_IDENTITY', server.includes('NOTIFICATION_IDENTITY_POLICY')
    && server.includes('withServerOwnedIdentity')
    && server.includes("'/api/API_ThongBao_AI'")
    && server.includes("'/api/API_ThongBao_Admin_AI'")
    && server.includes("'/api/API_ThongBao_Push_AI'")],
  ['MARK_READ_IDEMPOTENCY_GATEWAY', server.includes('NOTIFICATION_MUTATION_ACTIONS')
    && server.includes('IDEMPOTENCY_KEY_REQUIRED')],
  ['NOTIFICATION_PAGE_SERVER_IDENTITY', !/localStorage|\bUser\s*:|\bUsername\s*:/.test(notifications)],
  ['NOTIFICATION_PAGE_ACTIONS', notifications.includes("Action: 'LIST'")
    && notifications.includes("Action: 'DETAIL'")
    && notifications.includes("Action: 'MARK_READ'")],
  ['NOTIFICATION_PAGE_BYPASSES_CACHE', notifications.includes('{ cache: false }')],
  ['NOTIFICATION_PAGE_SAFE_BODY', notifications.includes("$('#notif-detail-body').text(")],
  ['WEB_PUSH_HANDLERS', serviceWorker.includes("addEventListener('push'")
    && serviceWorker.includes("addEventListener('notificationclick'")],
  ['WEB_PUSH_STORAGE', push.includes('AI_NotificationPushSubscriptionTbl')
    && push.includes('AI_NotificationPushDeliveryTbl')
    && push.includes('SubscriptionCipher') && push.includes('API_ThongBao_Push_AI')],
  ['WEB_PUSH_BROWSER_SUBSCRIPTION', pushService.includes('PushManager')
    && pushService.includes("Action: 'SUBSCRIBE'") && pushService.includes("Action: 'UNSUBSCRIBE'")],
  ['WEB_PUSH_AT_REST_ENCRYPTION', server.includes('encryptPushSubscription')
    && server.includes('aes-256-gcm') && server.includes('NOTIFICATION_PUSH_ENCRYPTION_KEY')],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`NOTI-001 preflight: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
