/**
 * Thư viện các hàm kiểm định (Assertion Helper) cho Medstand Regression Testing
 */

class AssertionException extends Error {
    constructor(message, actual, expected) {
        super(message);
        this.name = 'AssertionException';
        this.actual = actual;
        this.expected = expected;
    }
}

const assertions = {
    /**
     * Xác thực chuỗi con tồn tại trong chuỗi cha
     */
    assertContains(actual, expected, message = 'Actual value does not contain expected substring') {
        const actStr = String(actual || '');
        const expStr = String(expected || '');
        if (!actStr.toLowerCase().includes(expStr.toLowerCase())) {
            throw new AssertionException(
                `${message} (Expected: "${expStr}" to be inside "${actStr.substring(0, 100)}...")`,
                actStr,
                expStr
            );
        }
    },

    /**
     * Xác thực chuỗi con KHÔNG tồn tại trong chuỗi cha
     */
    assertNotContains(actual, expected, message = 'Actual value contains forbidden substring') {
        const actStr = String(actual || '');
        const expStr = String(expected || '');
        if (actStr.toLowerCase().includes(expStr.toLowerCase())) {
            throw new AssertionException(
                `${message} (Forbidden: "${expStr}" was found in "${actStr.substring(0, 100)}...")`,
                actStr,
                expStr
            );
        }
    },

    /**
     * Xác thực giá trị khớp với biểu thức chính quy (Regex)
     */
    assertRegex(actual, regex, message = 'Actual value does not match regex pattern') {
        const actStr = String(actual || '');
        const r = typeof regex === 'string' ? new RegExp(regex, 'i') : regex;
        if (!r.test(actStr)) {
            throw new AssertionException(
                `${message} (Expected matching regex: ${r.toString()} | Actual: "${actStr.substring(0, 100)}...")`,
                actStr,
                regex.toString()
            );
        }
    },

    /**
     * Xác thực mã phản hồi HTTP
     */
    assertStatusCode(actualCode, expectedCode, message = 'HTTP status code mismatch') {
        if (parseInt(actualCode, 10) !== parseInt(expectedCode, 10)) {
            throw new AssertionException(
                `${message} (Expected: ${expectedCode} | Actual: ${actualCode})`,
                actualCode,
                expectedCode
            );
        }
    },

    /**
     * Xác thực cấu trúc JSON (đơn giản, kiểm tra sự tồn tại của các key bắt buộc)
     */
    assertJsonSchema(actualObj, requiredFields = [], message = 'JSON schema validation failed') {
        if (!actualObj || typeof actualObj !== 'object') {
            throw new AssertionException(`${message} (Expected an object, got ${typeof actualObj})`, actualObj, 'object');
        }
        for (const field of requiredFields) {
            if (!(field in actualObj)) {
                throw new AssertionException(
                    `${message} (Missing required field: "${field}")`,
                    JSON.stringify(actualObj),
                    `Field: "${field}"`
                );
            }
        }
    }
};

module.exports = assertions;
