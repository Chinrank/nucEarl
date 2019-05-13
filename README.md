# My dumb version of curl

Install globally to unlock jurl, no dependencies other than node requried.

Some samples of what we can do.

Make a get request to a http or https endpoint - `jurl google.com`

Make a get request, following location headers - `jurl google.com --location`

Make a request over a proxy - `jurl google.com --proxy myProxy:9000`

Make a request with certain headers `jurl google.com -H 'User-Agent: itsame'`

Some headers have shortcuts `jurl google.com --cookie honey=grim --cookie hello=there`

Make a head request `jurl google.com -I`

Make a request using another method `jurl google.com -X DELETE`
(Note, -X HEAD will give an empty response, as except in -I case we don't print the headers).

Get headers from a request `jurl google.com --getHeaders`

Post some data via x-www-form-urlencoded `jurl google.com --data password=secret --data username=chinrank`

Post some data using multipart/form-data `jurl google.com --form file=@./test/hello.txt --form normalArg=thisone --form fileCopy=~@./test/hello.txt`

Output the response of a request to a file `jurl google.com --location -o itsGoogle.html`

Make multiple requests at once, outputting to several files `jurl google.com ask.com youtube.com --location -o google.html ask.html youtube.html`

Use a weak amount of pattern matching `jurl '{google,ask}.com' google.com/search?q=[1-4:3] -o google.html ask.html goog[1-4:3].html`

Turn off your proxy (jurl has some change of detecting it (if http appears in process.env)) `jurl localhost:8000 --noProxy`

Turn off security for 'secure requests' `jurl https://localhost:8000 -k`

Provide a cert to authenticate a secure request `jurl https://localhost:8000 --cacert ./test/cert.pem`

Enter a tcp connection `jurl --session --tcp www.google.com`

Enter a tcp connection, upgrade to a secure one `jurl --session --tls www.google.com`

Make some dns requests `jurl --dns --lookup google.com`

Make them with a provided list of dns' `jurl --dns --dnsServers 208.67.222.222 8.8.8.8 --lookup google.com`

Execute a command on a remote machine with a ssh server (several caveats here, this is by no means at all a full implementation, it doesn't even bother to verify the hmacs of the response, only supports ECDH as it's key exchange algorithm, only lets you login via username and pass etc. Nonetheless it should work with a modern default ssh setup). It may be done over proxy also.

`jurl --session --ssh ${name of the server}:${sshPort} -u ${username}:${password} --exec 'echo $((1 + 1))'`
