import re

with open('chatbot-api-engine.js', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(
    r'if \(res && res\.data && Array\.isArray\(res\.data\) && res\.data\.length > 0\) \{(.*?if \(_cbRender && _cbHtml\) \{.*?var html = _cbRender\()(res\.data, r \|\| \(''[^'']*'' \+ res\.data\.length \+ ''[^'']*''\))(.*?\}\s*else\s*\{\s*// Fallback Text Markdown)',
    re.DOTALL
)

replacement = r'''var arrData = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);
                if (arrData && arrData.length > 0) {
                    var msgRow = arrData.find(function(row) { return row.Msg !== undefined; });
                    if (msgRow && msgRow.MsgType !== undefined) {
                        _cbMsg && _cbMsg('ai', (msgRow.MsgType == 1 ? '⚠️ ' : '') + msgRow.Msg);
                        return;
                    }
                    var dataRows = arrData.filter(function(row) { return row.Msg === undefined && !row.Metadata_UITemplate; });
                    if (_cbRender && _cbHtml) {
                        var uiTpl = (res.uiTemplate || ApiEngine.getUiTemplate(apiCode) || 'DEFAULT').toUpperCase();
                        var dtToRender = dataRows.length ? dataRows : arrData;
                        var html = _cbRender(dtToRender, r || ('⚡ Tìm thấy ' + dtToRender.length + ' kết quả')\3'''

new_content = pattern.sub(replacement, content)

with open('chatbot-api-engine.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
