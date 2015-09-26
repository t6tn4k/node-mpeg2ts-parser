node-mpeg2ts-parser
========

MPEG-2 TS parser in Node.js.

## Installation

```shell
$ npm install mpeg2ts-parser
```

## Example

```javascript
var fs = require('fs');
var parser = require('mpeg2ts-parser')();

var m2ts = fs.createReadStream('foo.m2ts', { encoding: null });

parser.on('data', function(data) {
    console.log(data);

    /* example
    { transport_error_indicator: 0,
      payload_unit_start_indicator: 0,
      transport_priority: 0,
      pid: 511,
      transport_scrambling_control: 0,
      adaptation_field_control: 2,
      continuity_counter: 0,
      adaptation_field:
       { adaptation_field_length: 183,
         discontinuity_indicator: 0,
         random_access_indicator: 0,
         elementary_stream_priority_indicator: 0,
         pcr_flag: 1,
         opcr_flag: 0,
         splicing_point_flag: 0,
         transport_private_data_flag: 0,
         adaptation_field_extension_flag: 0,
         program_clock_reference_base: 4827203194,
         program_clock_reference_extension: 95 } }
    */
});

m2ts.pipe(parser);
```

