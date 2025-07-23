// わざとリントエラーを作成（テスト用）
const unused_variable = "これは使わない変数"

function badFunction(){
    console.log("セミコロンがない")  // セミコロンなし
    var old_style_var = "varは非推奨"
}