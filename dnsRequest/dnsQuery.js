const dns = require("dns");
const Resolver = dns.Resolver;

function dnsQuery(parsedArgs) {
    if (parsedArgs.hasOwnProperty("--getDns")) {
        return Promise.resolve(dns.getServers());
    } else if (parsedArgs.hasOwnProperty("--lookup")) {
        return lookupAddresses(parsedArgs);
    }
}

function lookupAddresses(parsedArgs) {
    let resolver;
    if (parsedArgs.hasOwnProperty("--dnsServers")) {
        resolver = new Resolver();
        resolver.setServers(parsedArgs["--dnsServers"]);
    } else {
        resolver = dns;
    }
    return Promise.all(parsedArgs["--lookup"].map(addr => lookupAddress(addr, resolver)));
}

function lookupAddress(address, resolver) {
    return new Promise((resolve, reject) => {
        if (resolver === dns) {
            resolver.lookup(address, (err, record, family) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ ip: record, family: family });
                }
            });
        } else {
            resolver.resolveAny(address, (err, record) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(record);
                }
            });
        }
    });
}

module.exports = dnsQuery;
