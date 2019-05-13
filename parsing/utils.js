const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

function recoverUrl({ hostname, port, path, protocol }) {
    return `${protocol}//${hostname}:${port}${path}`;
}

function parseURL(uri) {
    const allowedProtocols = ["^http://", "^https://", "^ftp://", "^ssh://"];
    const regexOfProtocols = new RegExp(allowedProtocols.join("|"));
    if (uri.match(regexOfProtocols)) {
        return url.parse(uri);
    } else {
        return url.parse("http://" + uri);
    }
}

function getProxy(parsedArgs) {
    if (parsedArgs.hasOwnProperty("--noProxy")) {
        return false;
    }
    if (parsedArgs.hasOwnProperty("--proxy")) {
        return parseURL(parsedArgs["--proxy"]);
    }
    if (process.env.HTTP) {
        return parseURL(process.env.HTTP);
    }
    return false;
}

function defaultPort(protocol) {
    return { "http:": 80, "https:": 443, "ftp:": 21, "--tcp": 80, "--tls": 443, "--ssh": 22 }[
        protocol
    ];
}

function chooseMethod(options, parsedArgs) {
    if (options.onlyHead) {
        return "HEAD";
    }
    if (parsedArgs["-X"]) {
        return parsedArgs["-X"];
    }
    if (parsedArgs["--data"] || parsedArgs["--form"]) {
        return "POST";
    }
    return "GET";
}

function getPipeLocation(parsedArgs, i) {
    if (!parsedArgs.hasOwnProperty("-o")) {
        return false;
    }
    if (i <= parsedArgs["-o"].length) {
        return parsedArgs["-o"][i];
    }
    return false;
}

function getClearTextUserPass(parsedArgs) {
    if (!parsedArgs.hasOwnProperty("-u")) {
        return false;
    }
    const { left, right } = splitOnDelim(parsedArgs["-u"], ":");
    return { user: left, pass: right };
}

function genBoundary(parsedArgs) {
    if (!parsedArgs["--form"]) {
        return false;
    }
    return crypto.randomBytes(8).toString("hex");
}

function getHostname(hostname, parsedArgs, i, redirect) {
    if (!parsedArgs["--resolve"] || parsedArgs["--resolve"].length <= i || redirect) {
        return hostname;
    }
    return splitOnDelim(parsedArgs["--resolve"][i], ":").right;
}

function splitOnDelim(str, delim) {
    const delimIndex = str.indexOf(delim);
    const left = str.slice(0, delimIndex);
    const right = str.slice(delimIndex + 1);
    return { left, right };
}

function getExtraCAs(parsedArgs) {
    if (!parsedArgs.hasOwnProperty("--cacert")) {
        return false;
    }
    return parsedArgs["--cacert"].map(pathToCert => fs.readFileSync(pathToCert));
}

module.exports = {
    parseURL,
    getProxy,
    recoverUrl,
    defaultPort,
    chooseMethod,
    getPipeLocation,
    getClearTextUserPass,
    genBoundary,
    getHostname,
    getExtraCAs
};
