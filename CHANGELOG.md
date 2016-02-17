# 2.9.0
- better integration with rabbitr

To migrate just replace the following:
```js
require('flight-control-client')
rabbitr.use(fc.rabbitr);
```
with
```js
require('flight-control-client/rabbitr')(rabbitr);
```

# 2.8.3
- throw SyntaxErrors back in uncaughtException handler
