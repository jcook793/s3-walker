S3 Walker
=========

A Node.js module to walk an S3 bucket for objects or prefixes (aka folders, directories, etc.). Uses events so the pagination is handled for you.

Installation
------------
```
npm install --save s3-walker
```

Methods
-------
### Constructor: ```S3Walker(s3, maxConnections)```
```s3``` is an S3 client passed in, typically from calling ```AWS.S3()```.  ```maxConnections``` is optional, defaults to 10.

### ```walkPrefixes(bucket, prefix)```
Walk the bucket and fire prefix-related events.  This is much faster than walking all objects in a bucket.  ```prefix``` is optional, if given it will only find prefixes inside the given prefix.  Events fired:
* prefix - ```(String)``` when a new prefix is found
* end - when the walking is complete
* error - ```(error)``` when an error occurs

### ```walkObjects(bucket, prefix)```
Walk the bucket and fire an event for every batch of objects.  Events fired:
* startPrefix - ```(String)``` a new prefix was found and is being walked
* endPrefix - ```(String, {count: Number, size: Number})``` no more objects exist with this prefix, provides count and total size (bytes) for prefix
* objects - ([])

Examples!
---------
### Output all the prefixes in an S3 bucket

```javascript
var AWS = require('aws-sdk'),
    S3Walker = require('s3-walker'),
    s3 = new AWS.S3(),
    walker = new S3Walker(s3);

walker.walkPrefixes('my-bucket')
    .on('prefix', function(prefix) {
        console.log('Found prefix', prefix);
    })
    .on('error', function(err) {
        console.error(err, err.stack);
    })
    .on('end', function() {
        console.log('Done');
    });
```

### Print a summary table of all counts/sizes per prefix
```javascript
var AWS = require('aws-sdk'),
    S3Walker = require('s3-walker'),
    humanize = require('humanize'),
    Table = require('cli-table');
    s3 = new AWS.S3(),
    walker = new S3Walker(s3),
    prefixes = {};

walker.walkObjects('my-bucket')
    .on('endPrefix', function(prefix, totals) {
        prefixes[prefix] = totals;
        humanize.numberFormat(prefixes[prefix].count, 0), 'objects',
        humanize.filesize(prefixes[prefix].size));
    })
    .on('error', function(err) {
        console.error(err, err.stack);
    })
    .on('end', function() {
        var table = new Table({ head: ['Prefix', 'Objects', 'Total Size'] }),
            totalCount = 0,
            totalBytes = 0;

        for(var prefix in prefixes) {
            table.push([prefix,
                        humanize.numberFormat(prefixes[prefix].count, 0),
                        humanize.filesize(prefixes[prefix].size)]);
            totalCount += prefixes[prefix].count;
            totalBytes += prefixes[prefix].size;
        }

        table.push(['TOTALS',
                    humanize.numberFormat(totalCount, 0),
                    humanize.filesize(totalBytes)])

        console.log(table.toString());
    });
```

The output would look something like this:

| Prefix                       | Objects | Total Size |
| -----------------------------|---------|------------|
| documents/                   | 15,835  | 3.47 GB    |
| old-documents/personal/      | 6       | 2.53 MB    |
| old-documents/               | 0       | 0 bytes    |
| old-documents/work/          | 11      | 9.44 MB    |
| personal/                    | 948     | 101.84 MB  |
| work/                        | 2,539   | 14.76 MB   |
| other/                       | 7,422   | 935.77 MB  |
| TOTALS                       | 26,761  | 4.51 GB    |

