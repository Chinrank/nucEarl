const http = require("http");
const https = require("https");
const fs = require("fs");

function handleResponse(res, resolve, reject, { options, parsedArgs, makeSingleRequest }) {
    if (res.headers.location && options.location) {
        resolve(makeSingleRequest(parsedArgs, res.headers.location, options.indexInArr, true));
    }
    if (options.pipeToFile) {
        const outFile = fs.createWriteStream(options.pipeToFile);
        res.pipe(outFile);
        res.on("end", () => {
            outFile.end();
            outFile.on("close", () => resolve(`File ${options.pipeToFile} created`));
        });
    } else {
        let resp = "";
        res.on("data", chunk => {
            resp += chunk;
        });
        res.on("error", err => reject(err));
        res.on("end", () => {
            const content = parsedArgs["--getHeaders"] ? [res.headers, resp] : resp;
            resolve(options.onlyHead ? res.headers : content);
        });
    }
}

function hypertextRequest(protocol, request, { options, parsedArgs, makeSingleRequest }) {
    return new Promise((resolve, reject) => {
        const madeRequest = protocol.request(request, res => {
            handleResponse(res, resolve, reject, { options, parsedArgs, makeSingleRequest });
        });
        if (parsedArgs["--data"]) {
            const dataArr = parsedArgs["--data"].map(data => {
                if (options.urlEncode) {
                    return encodeURI(data);
                } else {
                    return data;
                }
            });
            madeRequest.write(dataArr.join("&"));
        }
        if (parsedArgs["--form"]) {
            handleMultipartForm(madeRequest, parsedArgs, options);
        } else {
            madeRequest.end();
        }
    });
}

async function handleMultipartForm(madeRequest, parsedArgs, options) {
    const valsToSend = parsedArgs["--form"];
    for (let elt of valsToSend) {
        const split = elt.indexOf("=");
        const key = elt.slice(0, split);
        const val = elt.slice(split + 1);
        madeRequest.write(
            `\r\n--${options.boundary}\r\n` +
                `Content-Type: application/octet-stream\r\n` +
                `Content-Disposition: form-data; name="${key}";${
                    val[0] === "@" ? `filename="${val.slice(1)}"` : ""
                }\r\n\r\n`
        );
        if (val[0] !== "@") {
            madeRequest.write(`${val}\r\n`);
        } else {
            await pipeInFile(val.slice(1), madeRequest);
        }
    }
    madeRequest.write(`--${options.boundary}--\r\n`);
    madeRequest.end();
}

function pipeInFile(filename, madeRequest) {
    return new Promise((resolve, reject) => {
        const inFile = fs.createReadStream(filename);
        inFile.pipe(
            madeRequest,
            { end: false }
        );
        inFile.on("end", () => {
            madeRequest.write("\r\n");
            resolve("Complete");
        });
        inFile.on("error", err => reject(err));
    });
}

const httpRequest = (request, { options, parsedArgs, makeSingleRequest }) =>
    hypertextRequest(http, request, { options, parsedArgs, makeSingleRequest });

const httpsRequest = (request, { options, parsedArgs, makeSingleRequest }) =>
    hypertextRequest(https, request, { options, parsedArgs, makeSingleRequest });

module.exports = { httpRequest, httpsRequest };
