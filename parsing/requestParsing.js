const {
    parseURL,
    defaultPort,
    getProxy,
    chooseMethod,
    getPipeLocation,
    getClearTextUserPass,
    genBoundary,
    getHostname,
    getExtraCAs,
    recoverUrl
} = require("./utils");
const { ProxyAgent } = require("../ProxyAgent");
const http = require("http");
const https = require("https");

function computeRequest(options, parsedArgs) {
    const headers = {};
    if (parsedArgs["-H"]) {
        parsedArgs["-H"].forEach(header => {
            const key = header.slice(0, header.indexOf(":"));
            const val = header.slice(header.indexOf(":") + 1).trim();
            headers[key] = val;
        });
    }
    if (parsedArgs["--form"]) {
        headers["Content-Type"] = `multipart/form-data; boundary="${options.boundary}"`;
    }
    if (parsedArgs["--referer"]) {
        headers["Referer"] = parsedArgs["--referer"];
    }
    if (parsedArgs["--user-agent"]) {
        headers["User-Agent"] = parsedArgs["--user-agent"];
    }
    if (parsedArgs["--cookie"]) {
        headers["Cookie"] = parsedArgs["--cookie"].join("; ");
    }
    const request = {
        host: options.hostname,
        method: chooseMethod(options, parsedArgs),
        port: options.port,
        path: options.path,
        rejectUnauthorized: options.ignoreSecurity,
        headers: headers
    };
    if (options.ca) {
        request.ca = options.ca;
    }
    if (options.proxy) {
        if (options.protocol === "https:" || parsedArgs.hasOwnProperty("--connect")) {
            request.agent = new ProxyAgent({
                ca: options.ca,
                ignoreSecurity: options.ignoreSecurity,
                secure: options.protocol === "https:",
                proxyProtocol: options.proxy.protocol === "https:" ? https : http,
                proxyHost: options.proxy.hostname,
                proxyPort: options.proxy.port
            });
        } else {
            request.path = recoverUrl(options);
            request.headers.Host = options.hostname;
            request.host = options.proxy.hostname;
            request.port = options.proxy.port;
        }
    }
    return request;
}

function requestOptions(parsedArgs, uri, i, redirect) {
    const URL = parseURL(uri);

    const options = {
        protocol: URL.protocol,
        hostname: getHostname(URL.hostname, parsedArgs, i, redirect),
        port: URL.port ? URL.port : defaultPort(URL.protocol),
        path: URL.path ? URL.path : "/",
        onlyHead: parsedArgs.hasOwnProperty("--head") || parsedArgs.hasOwnProperty("-I"),
        location: parsedArgs.hasOwnProperty("--location"),
        pipeToFile: getPipeLocation(parsedArgs, i),
        proxy: getProxy(parsedArgs),
        userPass: getClearTextUserPass(parsedArgs),
        boundary: genBoundary(parsedArgs),
        urlEncode: parsedArgs.hasOwnProperty("--urlEncode"),
        ignoreSecurity: !parsedArgs.hasOwnProperty("-k"),
        ca: getExtraCAs(parsedArgs),
        indexInArr: i
    };

    return options;
}

module.exports = { computeRequest, requestOptions };
