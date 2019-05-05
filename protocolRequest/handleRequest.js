const { httpRequest, httpsRequest } = require("./hypertextRequest");
const ftpRequest = require("./ftpRequest");
const { requestOptions, computeRequest } = require("../parsing/requestParsing");

function makeRequest(parsedArgs) {
    return Promise.all(parsedArgs["--uri"].map((uri, i) => makeSingleRequest(parsedArgs, uri, i)));
}

function makeSingleRequest(parsedArgs, uri, i, redirect = false) {
    const options = requestOptions(parsedArgs, uri, i, redirect);
    const request = computeRequest(options, parsedArgs);
    const requestFuncs = {
        "http:": httpRequest,
        "https:": httpsRequest,
        "ftp:": ftpRequest
    };
    return requestFuncs[options.protocol](request, { options, parsedArgs, makeSingleRequest });
}

module.exports = { makeRequest, makeSingleRequest };
