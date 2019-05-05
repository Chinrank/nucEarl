const dgram = require("dgram");

const ID = "AAAA";
const queryParams = "0100"; // formed by concatting stuff according to protocol spec
const numberQuestions = "0001";
const numberAnswers = "0000";
const numberAuthRecords = "0000";
const numberAdditionalRecords = "0000";
const queryName = Buffer.from("google", "utf-8").toString("hex");
const end = Buffer.from("com", "utf-8").toString("hex");

const preMessage = `${ID} ${queryParams} ${numberQuestions} ${numberAnswers} ${numberAuthRecords} ${numberAdditionalRecords} 06 ${queryName} 03 ${end} 00 00 01 00 01`;
const message = Buffer.from(preMessage.replace(/ /g, ""), "hex");
const client = dgram.createSocket("udp4");

client.send(message, 53, "8.8.8.8", err => (err ? console.log(err) : ""));

client.on("message", chunk => {
    const stringedChunk = chunk.toString("hex");
    const ipPart = stringedChunk.slice(stringedChunk.length - 8);
    let ip = "";
    for (let i = 0; i < 4; i++) {
        const ithPart = parseInt(ipPart.slice(2 * i, 2 * i + 2), 16);
        ip += ithPart + ".";
    }
    console.log("google ip is", ip);
    client.close();
});
