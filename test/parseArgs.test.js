const parseArgs = require("../parsing/parseArgs");
const assert = require("assert");

const argFlags = {
    defaultFlag: { minLength: 1, maxLength: Infinity, name: "def" },
    def: { minLength: 1, maxLength: 4, multi: true },
    w: { minLength: 1, maxLength: 1 },
    x: { minLength: 0, maxLength: 0 },
    y: { minLength: 2, maxLength: 2 },
    z: { minLength: 1, maxLength: 3 }
};

const args1 = [
    "def1",
    "def2",
    "def3",
    "def4",
    "def5",
    "x",
    "def6",
    "y",
    "y1",
    "y2",
    "y",
    "y3",
    "y4",
    "def7",
    "def8",
    "def9",
    "z",
    "z1",
    "z2",
    "w",
    "w1"
];

const expected1 = {
    def: [["def1", "def2", "def3", "def4"], ["def5"], ["def6"], ["def7", "def8", "def9"]],
    x: true,
    w: "w1",
    y: ["y1", "y2"],
    z: ["z1", "z2"]
};
const parsedArgs1 = parseArgs(args1, argFlags);

assert.deepStrictEqual(parsedArgs1, expected1);

const args2 = ["y", "y1", "z", "z1"];

assert.throws(() => parseArgs(args2, argFlags), { name: "SyntaxError" });
