const https = require("https");
const fs = require("fs");

const options = {
    key: fs.readFileSync("./test/key.pem"),
    cert: fs.readFileSync("./test/cert.pem")
};

https
    .createServer(options, (req, res) => {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", () => {
            res.statusCode = 200;
            res.setHeader("Set-Cookie", ["jam=nice", "me=jv"]);
            res.setHeader("Content-Type", "text/plain");
            res.write("I am https\r\n");
            res.write(JSON.stringify(req.headers));
            res.write("\r\n");
            res.write(body);
            res.end(process.argv[2]);
        });
    })
    .listen(parseInt(process.argv[2]), () => {
        console.log("httpsServer started");
    });
