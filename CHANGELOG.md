# 2.12.0
- always send 'X-FC-Transaction' header in express middleware
- log unhandled promise rejections as warnings

# 2.11.0
- stop publishing ts files to npm

# 2.10.2
- wrapAsync method

# 2.10.0
- typescript!

# 2.9.0
- better integration with rabbitr

To migrate just replace the following:
```js
require('flight-control-client')
rabbitr.use(fc.rabbitr);
```
with
```js
import * as hook from 'flight-control-client/rabbitr';
hook(rabbitr);
```

# 2.8.3
- throw SyntaxErrors back in uncaughtException handler
