# neuron-builder [![NPM version](https://badge.fury.io/js/neuron-builder.png)](http://badge.fury.io/js/neuron-builder) [![Build Status](https://travis-ci.org/cortexjs/neuron-builder.png?branch=master)](https://travis-ci.org/cortexjs/neuron-builder) [![Dependency Status](https://gemnasium.com/cortexjs/neuron-builder.png)](https://gemnasium.com/cortexjs/neuron-builder)

## API

### builder.parse(file, option, callback)

#### arguments
- file: the parsing file
- option.pkg: mixed package json format of project
- option.targetVersion: target version to build
- option.cwd: current working directory
- option.allowNotInstalled

`callback` will get `err` and `contents` as its arguments, where `contents` is the wrapped result.