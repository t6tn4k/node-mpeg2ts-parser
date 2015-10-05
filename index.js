'use strict';

var stream = require('stream');
var util = require('util');


/**
 * @private
 * @param {Buffer} packet - TS packet
 * @return {Object}
 */
var parseAdaptationField = function(packet) {
    var adaptation_field_length = packet[4];

    if (adaptation_field_length <= 0) {
        return {
            adaptation_field_length: adaptation_field_length
        };
    }

    var adaptation_field = {
        adaptation_field_length:              adaptation_field_length,
        discontinuity_indicator:              (packet[5] & 0x80) >>> 7,
        random_access_indicator:              (packet[5] & 0x40) >>> 6,
        elementary_stream_priority_indicator: (packet[5] & 0x20) >>> 5,
        pcr_flag:                             (packet[5] & 0x10) >>> 4,
        opcr_flag:                            (packet[5] & 0x08) >>> 3,
        splicing_point_flag:                  (packet[5] & 0x04) >>> 2,
        transport_private_data_flag:          (packet[5] & 0x02) >>> 1,
        adaptation_field_extension_flag:      (packet[5] & 0x01)
    };

    var index = 6;

    if (adaptation_field.pcr_flag) {
        adaptation_field.program_clock_reference_base
            = packet.readUInt32BE(index) * 2 + ((packet[index + 4] & 0x80) >>> 7);

        adaptation_field.program_clock_reference_extension
            = (packet[index + 4] & 0x1) * 256 + packet[index + 5];

        index += 6;
    }

    if (adaptation_field.opcr_flag) {
        adaptation_field.original_program_clock_reference_base
            = packet.readUInt32BE(index) * 2 + ((packet[index + 4] & 0x80) >>> 7);

        adaptation_field.original_program_clock_reference_extension
            = (packet[index + 4] & 0x1) * 256 + packet[index + 5];

        index += 6;
    }

    if (adaptation_field.splicing_point_flag) {
        adaptation_field.splice_countdown = packet.readInt8(index);

        index += 1;
    }

    if (adaptation_field.transport_private_data_flag) {
        adaptation_field.transport_private_data_length = packet[index];

        adaptation_field.private_data = packet.slice(index + 1,
            index + 1 + adaptation_field.transport_private_data_length);

        index += 1 + adaptation_field.transport_private_data_length;
    }

    if (adaptation_field.adaptation_field_extension_flag) {
        adaptation_field.adaptation_field_extension_length = packet[index];

        adaptation_field.ltw_flag             = (packet[index + 1] & 0x80) >>> 7;
        adaptation_field.piecewise_rate_flag  = (packet[index + 1] & 0x40) >>> 6;
        adaptation_field.seamless_splice_flag = (packet[index + 1] & 0x20) >>> 5;

        index += 2;

        if (adaptation_field.ltw_flag) {
            adaptation_field.ltw_valid_flag = (packet[index] & 0x80) >>> 7;

            adaptation_field.ltw_offset
                = (packet[index] & 0x7f) * 256 + packet[index + 1];

            index += 2;
        }

        if (adaptation_field.piecewise_rate_flag) {
            adaptation_field.piecewise_rate = (packet[index] & 0x3f) * 65536
                + packet[index + 1] * 256 + packet[index + 2];

            index += 3;
        }

        if (adaptation_field.seamless_splice_flag) {
            adaptation_field.splice_type = (packet[index] & 0xf0) >>> 4;

            // 536870912 = 2 ^ 29
            // 4194304   = 2 ^ 22
            // 16384     = 2 ^ 14
            // 128       = 2 ^ 7
            adaptation_field.dts_next_au = (packet[index] & 0x0e) * 536870912
                + packet[index + 1] * 4194304 + (packet[index + 2] & 0xfe) * 16384
                + packet[index + 3] * 128 + ((packet[index + 4] & 0xfe) >>> 1);
        }
    }

    return adaptation_field;
};


/**
 * @private
 * @param {Buffer} chunk - Buffer
 * @return {Object}
 */
var parsePacket = function(chunk) {
    if (chunk[0] !== 0x47 /* sync byte */) {
        throw new Error('Not a ts packet');
    }

    var packet = {
        transport_error_indicator:    (chunk[1] & 0x80) >>> 7,
        payload_unit_start_indicator: (chunk[1] & 0x40) >>> 6,
        transport_priority:           (chunk[1] & 0x20) >>> 5,
        pid:                          ((chunk[1] & 0x1f) << 8) | chunk[2],
        transport_scrambling_control: (chunk[3] & 0xc0) >>> 6,
        adaptation_field_control:     (chunk[3] & 0x30) >>> 4,
        continuity_counter:           chunk[3] & 0x0f,
        packet:                       chunk
    };

    if (packet.adaptation_field_control & 0x2) {
        packet.adaptation_field = parseAdaptationField(chunk);
    }

    if (packet.adaptation_field_control & 0x1) {
        packet.payload = chunk.slice(5 + ((packet.adaptation_field_control & 0x2) ?
            packet.adaptation_field.adaptation_field_length : 0));
    }

    return packet;
};


/**
 * @class
 * @param {Object} options
 */
var Mpeg2TsParser = function(options) {
    if (!(this instanceof Mpeg2TsParser)) {
        return new Mpeg2TsParser(options);
    }

    stream.Transform.call(this, typeof options === 'undefined' ? {} : options);

    this._writableState.objectMode = false;
    this._readableState.objectMode = true;

    this._buffer = new Buffer(0);
};

util.inherits(Mpeg2TsParser, stream.Transform);


/**
 * @private
 */
Mpeg2TsParser.prototype._transform = function(chunk, encoding, callback) {
    if (this._buffer.length + chunk.length < 188) {
        try {
            this._buffer = Buffer.concat([ this._buffer, chunk ]);
        } catch (err) {
            callback(err);
            return;
        }

        callback();
        return;
    }

    try {
        this.push(parsePacket(Buffer.concat(
            [ this._buffer, chunk.slice(0, 188 - this._buffer.length) ], 188)));

        chunk = chunk.slice(188 - this._buffer.length);

        var index = 0;

        for (; index + 188 < chunk.length; index += 188) {
            this.push(parsePacket(chunk.slice(index, index + 188)));
        }

        this._buffer = chunk.slice(index);
    } catch (err) {
        callback(err);
        return;
    }

    callback();
};

module.exports = Mpeg2TsParser;

