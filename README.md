[![Build Status](https://travis-ci.org/kaelzhang/neuron-module-builder.png?branch=master)](https://travis-ci.org/kaelzhang/neuron-module-builder)

# neuron-module-builder

## Usage

```js
var builder = require('neuron-module-builder');

builder(file, options, callback)
  .on('warn', function(message){
    console.warn(message);
  });
```

### builder(filename, options, callback)

- filename `String` the pathname of the entry file to be parsed from
- options `Object`
  - pkg: `Object` mixed package json format of project
  - cwd: `String` current working directory
  - compilers: `Object|Array.<Object>`
  - allow_implicit_dependencies: `Boolean` whether allows implicit dependencies. If true and a dependency is not found in `pkg`, it will be treated as the latest version.
- callback `function(err, content)`

`callback` will get `err`, `contents` and `parsed` as its arguments, where:

- err `Error`
- content `String` the parsed content



