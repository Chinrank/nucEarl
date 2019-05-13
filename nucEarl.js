#!/usr/bin/env node

const parseArgs = require("./parsing/parseArgs");
const curlFlags = require("./curlFlags");
const { makeRequest } = require("./protocolRequest/handleRequest");
const enterSession = require("./establishSession/enterSession");
const dnsQuery = require("./dnsRequest/dnsQuery");
const expandArgs = require("./expansions/expandArgs");

function handleCommand(parsedArgs) {
    if (parsedArgs.hasOwnProperty("--uri")) {
        makeRequest(parsedArgs)
            .then(results => results.forEach(res => console.log(res)))
            .catch(err => console.error(err));
    } else if (parsedArgs.hasOwnProperty("--session")) {
        return enterSession(parsedArgs);
    } else if (parsedArgs.hasOwnProperty("--dns")) {
        dnsQuery(parsedArgs)
            .then(results => results.forEach(res => console.log(res)))
            .catch(err => console.error(err));
    }
}

handleCommand(expandArgs(parseArgs(process.argv.slice(2), curlFlags)));
