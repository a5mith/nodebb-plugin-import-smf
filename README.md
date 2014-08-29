nodebb-plugin-import-smf
========================

a SMF 2.0 forum exporter to be required by [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import).

### What is this?

It's __just__ an exporter of [SMF 2.0](http://www.simplemachines.org/),  that provides an API that [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import)
can use to exporter source forum data and import it to NodeBB's database. So, it's not really a conventional nodebb-plugin.

### Why is it even a NodeBB plugin?

it doesn't really need to be, nor that you can use it within NodeBB it self, but, having this as a plugin have few benefits:
* a nodebb- namespace, since you can't really use it for anything else
* it can easily `require` NodeBB useful tools, currently

### Usage within NodeJS only

```
// you don't have to do this, nodebb-plugin-import will require this plugin and use its api
// but if you want a run a test

var exporter = require('nodebb-plugin-import-smf');

exporter.testrun({
    dbhost: '127.0.0.1',
    dbport: 3306,
    dbname: 'smf',
    dbuser: 'user',
    dbpass: 'password',

    tablePrefix: 'smf_'
}, function(err, results) {

    /*
        results[0] > config
        results[1] > [usersMap, usersArray]
        results[2] > [categoriesMap, categoriesArray]
        results[3] > [topicsMap, topicsArray]
        results[4] > [postsMap, postsArray]
    */
});

```

### What does it export?
read carefully:

- ####Users:
    * `_username` YES. SMF for some reason allows duplicate users with same emails? so the first ones by ID orders will be saved, the rest will be skipped. (SMF appends [username]_dup[Number] next to the dups.. so those will be skipped too if the email is already used)
    * `_alternativeUsername` YES. as the __SMF.User.UserDisplayName__, which [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import) will try to use if the username validation fails
    * `_password` NO. SMF uses SHA-1, NodeBB uses bcrypt, so can't do, but if you use [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import) it will generate random passwords and hand them to you so can email them.
    * `_level` (administrator and moderator) NO.
    * `_joindate` YES, SMF uses Seconds, the exported will convert to Milliseconds
    * `_website` NO.
    * `_picture` NO.
    * `_reputation` NO.
    * `_profileviews` NO.
    * `_location` NO.
    * `_signature` NO.
    * `_banned` YES. it will stay banned, by username


- ####Categories (AKA Forums per SMF Speak):
    * `_name` YES
    * `_description` YES

- ####Topics:
    * `_cid` __(or its SMF category aka Forum id)__ YES (but if its parent Category is skipped, this topic gets skipped)
    * `_uid` __(or its SMF user id)__ YES (but if its user is skipped, this topic gets skipped)
    * `_title` YES
    * `_content` __(or the 'parent-post` content of this topic)__ YES (HTML - read the [Markdown Note](#markdown-note) below)
    * `_timestamp` YES, SMF uses Seconds, the exporter will convert to Milliseconds
    * `_pinned` YES (0 or 1) (I don't know how many you can pin in NodeBB)
    * `_approved` YES (0 or 1)
    * `_locked` YES (0 or 1)
    * `_viewcount` YES

- ####Posts:
    * `_pid` __(or its SMF post id)__
    * `_tid` __(or its SMF parent topic id)__ YES (but if its parent topic is skipped, this post gets skipped)
    * `_uid` __(or its SMF user id)__ YES (but if its user is skipped, this post is skipped)
    * `_content` YES (HTML - read the [Markdown Note](#markdown-note) below)
    * `_timestamp` YES, SMF uses Seconds, the exporter will convert to Milliseconds

### SMF Versions tested on:
  - SMF 2.0

### Markdown note

read [nodebb-plugin-import#markdown-note](https://github.com/akhoury/nodebb-plugin-import#markdown-note)

### It's an exporter, why does it have 'import' in its title

To keep the namespacing accurate, this __exporter__ is designed to export data for [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import) only, also for a 1 time use.

