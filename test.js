var fs = require('fs-extra');

require('./index').testrun({
    dbhost: 'localhost',
    dbport: 3306,
    dbname: 'smf',
    dbuser: 'user',
    dbpass: 'password',

    tablePrefix: 'smf_'
}, function(err, results) {
    fs.writeFileSync('./tmp.json', JSON.stringify(results, undefined, 2));
});