var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    async = require('async');

function S3Walker(s3, maxConnections) {
    var self = this;

    self.s3 = s3;
    if(maxConnections) {
        self.maxConnections = maxConnections;
    } else {
        self.maxConnections = 10;
    }

    self.ignoredPrefixes = [];
}


S3Walker.prototype.ignorePrefix = function(prefix) {
    this.ignoredPrefixes.push(prefix);
};


S3Walker.prototype.ignorePrefixes = function(prefixes) {
    this.ignoredPrefixes = this.ignoredPrefixes.concat(prefixes);
};


S3Walker.prototype.walkPrefixes = function(bucket, prefix) {
    var self = this,
        emitter = new EventEmitter();

    prefix = prefix || '';

    var emitPrefixes = function(prefix, callback) {
        self.s3.listObjects({Bucket: bucket, Delimiter: '/', Prefix: prefix}, function(err, data) {
            if(err) {
                emitter.emit('error', err);
            } else {
                //This is in series for now until I implement an async queue or something similar
                async.eachSeries(data.CommonPrefixes, function(prefix, callback) {
                    if(self.ignoredPrefixes.indexOf(prefix.Prefix) === -1) {
                        emitter.emit('prefix', prefix.Prefix);
                        emitPrefixes(prefix.Prefix, callback);
                    } else {
                        callback();
                    }
                }, callback);
            }
        });
    };

    emitPrefixes(prefix, function(err) {
        if(err) {
            emitter.emit('error', err);
        } else {
            emitter.emit('end');
        }
    });

    return emitter;
};


S3Walker.prototype.walkObjects = function(bucket, prefix) {
    var self = this,
        emitter = new EventEmitter(),
        foundPrefixes = [];

    prefix = prefix || '';

    var emitObjects = function(marker, prefix, callback) {
        self.s3.listObjects({Bucket: bucket, Delimiter: '/', Prefix: prefix, Marker: marker}, function(err, data) {
            if(err) {
                emitter.emit('error', err);
            } else {
                emitter.emit('objects', { prefix: prefix, contents: data.Contents });
                foundPrefixes[prefix].count += data.Contents.length;
                foundPrefixes[prefix].size += getTotalSize(data.Contents);
                if(data.IsTruncated) {
                    emitObjects(data.NextMarker, prefix, callback);
                } else {
                    emitter.emit('endPrefix', prefix, foundPrefixes[prefix]);
                    callback();
                }
            }
        });
    };

    self.walkPrefixes(bucket, prefix)
        .on('prefix', function(foundPrefix) {
            foundPrefixes[foundPrefix] = { count: 0, size: 0 };
        })
        .on('error', function(err) {
            emitter.emit('error', err);
        })
        .on('end', function() {
            async.eachLimit(Object.keys(foundPrefixes), self.maxConnections, function(foundPrefix, callback) {
                emitter.emit('startPrefix', foundPrefix);
                emitObjects('', foundPrefix, callback);
            }, function(err) {
                if(err) {
                    emitter.emit('error', err);
                } else {
                    emitter.emit('end');
                }
            });
        });

    return emitter;
};


var getTotalSize = function(contents) {
    var size = 0;
    for(var i=0; i<contents.length; i++) {
        size += contents[i].Size;
    }
    return size;
};

module.exports = S3Walker;
