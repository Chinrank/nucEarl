const { fork } = require("child_process");
const parseArgs = require("../parsing/parseArgs");
const { makeRequest } = require("../protocolRequest/handleRequest");
const curlFlags = require("../curlFlags");
const assert = require("assert");
const fs = require("fs");
const expandArgs = require("../expansions/expandArgs");

const httpServer = fork("test/httpServer", ["8001"], { stdio: "pipe" });
const httpsServer = fork("test/httpsServer", ["8002"], { stdio: "pipe" });
const httpProxyServer = fork("test/httpProxyServer", ["8000"], { stdio: "pipe" });

process.on("exit", () => {
    httpServer.kill();
    httpsServer.kill();
    httpProxyServer.kill();
});

function waitForStart(server) {
    return new Promise((resolve, reject) => {
        server.stdout.on("data", () => resolve("started"));
    });
}

const tests = [
    {
        name: "requestHttpAndHttpsOverHttpProxyWithGivenCert",
        cmdArgs: "--proxy localhost:8000 https://localhost:8002 localhost:8001 --cacert ./test/cert.pem --connect".split(
            " "
        ),
        expectedRes: [
            'I am https\r\n{"host":"localhost:8002","connection":"close"}\r\n8002',
            'I am http\r\n{"host":"localhost:8001","connection":"close"}\r\n8001'
        ]
    },
    {
        name: "forgetAboutSecuritySendSomeHeaders",
        cmdArgs: ["https://localhost:8002", "-k", "-H", "Cookie: cookies=good", "--noProxy"],
        expectedRes: [
            'I am https\r\n{"cookie":"cookies=good","host":"localhost:8002","connection":"close"}\r\n8002'
        ]
    },
    {
        name: "resolveHostnamesManually",
        cmdArgs: "--resolve www.google.com:127.0.0.1 www.google.com:8001 --noProxy".split(" "),
        expectedRes: ['I am http\r\n{"host":"127.0.0.1:8001","connection":"close"}\r\n8001']
    },
    {
        name: "sendMultipartFormData",
        cmdArgs: "localhost:8001 --form file=@./test/hello.txt --form normalArg=thisone --form fileCopy=~@./test/hello.txt --noProxy".split(
            " "
        ),
        expectedRes: [
            'I am http\r\n{"content-type":"multipart/form-data; boundary=\\"aaaaaaaaaaaaaaaa\\"","host":"localhost:8001","connection":"close","transfer-encoding":"chunked"}\r\n\r\n--aaaaaaaaaaaaaaaa\r\nContent-Type: application/octet-stream\r\nContent-Disposition: form-data; name="file";filename="./test/hello.txt"\r\n\r\nYooooooooo\r\n\r\n--aaaaaaaaaaaaaaaa\r\nContent-Type: application/octet-stream\r\nContent-Disposition: form-data; name="normalArg";\r\n\r\nthisone\r\n\r\n--aaaaaaaaaaaaaaaa\r\nContent-Type: application/octet-stream\r\nContent-Disposition: form-data; name="fileCopy";\r\n\r\n~@./test/hello.txt\r\n--aaaaaaaaaaaaaaaa--\r\n8001'
        ],
        specialCheck: multipartCheck
    },
    {
        name: "redirectFollow",
        cmdArgs: "localhost:8001/redirect --location --noProxy".split(" "),
        expectedRes: ['I am http\r\n{"host":"localhost:8001","connection":"close"}\r\n8001']
    },
    {
        name: "x-wwwPostRequest",
        cmdArgs: "localhost:8001 --data password=secret --data username=chinrank --urlEncode --noProxy".split(
            " "
        ),
        expectedRes: [
            'I am http\r\n{"host":"localhost:8001","connection":"close","transfer-encoding":"chunked"}\r\npassword=secret&username=chinrank8001'
        ]
    },
    {
        name: "headRequestStoreData",
        cmdArgs: "localhost:8001 -o ./test/tempFileStore --noProxy".split(" "),
        expectedRes: 'I am http\r\n{"host":"localhost:8001","connection":"close"}\r\n8001',
        specialCheck: pipedToFileCheck
    },
    {
        name: "someBespokeHeaderFlags",
        cmdArgs: "localhost:8001 --cookie sessToken=asv --cookie honey=grim --referer ohIt'sme --user-agent myDumbCurl --noProxy".split(
            " "
        ),
        expectedRes: [
            'I am http\r\n{"referer":"ohIt\'sme","user-agent":"myDumbCurl","cookie":"sessToken=asv; honey=grim","host":"localhost:8001","connection":"close"}\r\n8001'
        ]
    },
    {
        name: "headRequest",
        cmdArgs: "localhost:8001 -I --noProxy".split(" "),
        expectedRes: ["set-cookie", "content-type", "date", "connection"],
        specialCheck: headOnlyCheck
    }
];

// 'needed' since the boundary is randomly generated
function multipartCheck(res, expectedRes, resolve) {
    const boundaryUsedInReq = res[0].match(/\\"(.{16})\\"/)[1];
    const boundaryRegex = new RegExp(boundaryUsedInReq, "g");
    const resToTestVs = res[0].replace(boundaryRegex, "aaaaaaaaaaaaaaaa");
    assert.deepStrictEqual([resToTestVs], expectedRes);
    resolve("done");
}

function pipedToFileCheck(res, expectedRes, resolve) {
    fs.readFile("./test/tempFileStore", (err, data) => {
        assert.equal(
            data.toString(),
            'I am http\r\n{"host":"localhost:8001","connection":"close"}\r\n8001'
        );
        resolve("done");
    });
}

function headOnlyCheck(res, expectedRes, resolve) {
    Object.keys(res[0]).forEach((key, i) => {
        assert.equal(key, expectedRes[i]);
    });
    resolve("done");
}

function waitForAllServers() {
    return Promise.all(
        [httpServer, httpsServer, httpProxyServer].map(server => waitForStart(server))
    ).then(() => {
        Promise.all(
            tests.map(test =>
                makeRequestCheckRes(test.cmdArgs, test.expectedRes, test.specialCheck)
            )
        )
            .then(() => {
                fs.unlink("./test/tempFileStore", () => process.exit(0));
            })
            .catch(err => {
                fs.unlink("./test/tempFileStore", () => {
                    console.error(err.expected[0]);
                    process.exit(1);
                });
            });
    });
}

function makeRequestCheckRes(cmdArgs, expectedRes, specialCheck) {
    const parsed = expandArgs(parseArgs(cmdArgs, curlFlags));
    return new Promise((resolve, reject) => {
        makeRequest(parsed).then(res => {
            try {
                if (specialCheck) {
                    specialCheck(res, expectedRes, resolve);
                } else {
                    assert.deepStrictEqual(res, expectedRes);
                    resolve("done");
                }
            } catch (err) {
                reject(err);
            }
        });
    });
}

waitForAllServers();
