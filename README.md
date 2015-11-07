# neuron-builder [![NPM version](https://badge.fury.io/js/neuron-builder.png)](http://badge.fury.io/js/neuron-builder) [![Build Status](https://travis-ci.org/cortexjs/neuron-builder.png?branch=master)](https://travis-ci.org/cortexjs/neuron-builder) [![Dependency Status](https://gemnasium.com/cortexjs/neuron-builder.png)](https://gemnasium.com/cortexjs/neuron-builder)

## Usage

```js
var builder = require('neuron-builder');

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



