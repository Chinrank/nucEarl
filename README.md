# My dumb version of curl

Try for example

node test/httpProxyServer 8000

node test/httpsServer 8001

node nucEarl --proxy localhost:8000 https://localhost:8001 --cacert ./test/cert.pem

You can run the tests via "npm test", they will create servers on 8000, 8001 and 8002 (which will (hopefully) be destroyed on exit).
