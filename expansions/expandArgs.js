const applyExpansions = require("./expansions");

function expandArgs(parsedArgs) {
    const expanded = JSON.parse(JSON.stringify(parsedArgs));
    const uri = parsedArgs["--uri"];
    const outfiles = parsedArgs["-o"];
    if (uri) {
        expanded["--uri"] = applyExpansions(uri);
    }
    if (outfiles) {
        expanded["-o"] = applyExpansions(outfiles.reduce((curr, prev) => curr.concat(prev), []));
    }
    return expanded;
}

module.exports = expandArgs;
