function escapeStr(str) {
    return str
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t");
}

function reprStr(str) {
    let json = JSON.stringify(str);
    return json.substring(1, json.length - 1);
}