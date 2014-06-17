'use strict';

var utils = require('../../../public/src/utils.js'),
	_ = require('underscore'),
	async = require('async'),
	fs = require('fs-extra'),
	mysql = require('mysql'),
	path = require('path'),
	http = require('http'),
	argv = require('optimist').argv,
	storage = require('node-persist'),
	Logger = require('tiny-logger'),


	Export = function (config) {

		this.config = _.extend({}, {
				log: 'info,warn,error,debug',
				storageDir: path.join(__dirname,  '../storage'),

				// clear the storage everytime
				clearStorage: false,

				// phpBB mysql db access configs
				db: {
					host: "localhost",
					user: "smf_user",
					password: "password",
					database: "smf_test"
				},
				tablePrefix: 'smf_',

				// Limit phpBB queries to certain time frames
				// DO NOT USE IN PRODUCTION
				// timestamp in SECONDS
				// this is potentially problematic,
				// since you can't migrate a topic or post that was created by a user who you wish not to migrate
				// I wouldn't use that, maybe for testing .. such as limiting your migration to pre 2004 or something to test it out quick, like I do
				timeMachine: {
					// using 'after' is very problematic, since dependencies may not exits, such as a parent topic to a post, a user to a topic, or even a category to a topic
					users: {
						after: null,
						before: null
					},
					categories: {
						after: null,
						before: null
					},
					topics: {
						after: null,
						before: null
					},
					posts: {
						after: null,
						before: null
					}
				}
			},
			config
		);

		this.init();
	};

Export.prototype = {

	init: function() {

		//init logger
		this.logger = Logger.init(this.config.log, '[export-smf]');
		this.logger.debug('init()');

		// find storage dir
		this.config.storageDir = path.resolve(this.config.storageDir);

		if (fs.existsSync(this.config.storageDir)) {
			if (!fs.lstatSync(this.config.storageDir).isDirectory()) {
				throw new Error(this.config.storageDir + ' is not a directory');
			}
			if (this.config.clearStorage) {
				fs.removeSync(this.config.storageDir);
				fs.mkdirsSync(this.config.storageDir);
			}
		} else {
			fs.mkdirsSync(this.config.storageDir);
		}

		this.logger.info("Storage directory is: " + this.config.storageDir);

		// init storage module
		storage.initSync({dir: this.config.storageDir});
	},

	start: function() {
		var _self = this;
		this.logger.debug('start()');

		async.series([
			function(next){
				_self.setup(next);
			},
			function(next) {
				_self.logger.info('\n\nExporting Users ...\n\n');
				_self.exportUsers(next);
			},
			function(next) {
				_self.logger.info('\n\nExporting Categories ...\n\n');
				_self.exportCategories(next);
			},
			function(next) {
				_self.logger.info('\n\nExporting Topics ...\n\n');
				_self.exportTopics(next);
			},
			function(next) {
				_self.logger.info('\n\nExporting Posts ...\n\n');
				_self.exportPosts(next);
			},
			function(next) {
				_self.report(next);
			},
			function(){
				_self.exit();
			}
		]);
	},

	exportCategories: function (next) {
		var _self = this,
			prefix = this.config.tablePrefix,
			query = 'SELECT '
				+ prefix + 'boards.id_board as _cid, '
				+ prefix + 'boards.name as _name, '
				+ prefix + 'boards.description as _description '
				+ 'FROM ' + prefix + 'boards '
				+ 'WHERE 1 = 1 ';

		this.c.query(query,
			function(err, rows){
				if (err) throw err;
				_self.logger.info('Forums query came back with ' + rows.length + ' records, now normalizing, please be patient.');
				_self._normalizeCategories(rows, function(_cids){
					_self.mem._cids = _cids;
					_self.logger.info('now writing categories array to disk, please be patient');
					storage.setItem('_cids.json', _self.mem._cids, next);
				});
			});
	},

	_normalizeCategories: function (rows, callback) {
		var kept = 0, i = 0,
			logger = this.logger,
			_cids = [];

		async.eachLimit(rows, 5, function(row, done) {
			var storedCategory = storage.getItem('c.' + row._cid) || {};
			if (storedCategory.normalized || storedCategory.skipped) {
				logger.debug('[c:' + i + '] category: ' + row._cid + ' already normalized');
				_cids.push(row._cid);

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1);
			} else {

				if (row._name) {
					row._description = row._description || '';

					kept++;
					storedCategory.normalized = row;
					if (i % 1000 == 0)
						logger.info('normalized ' + i + ' categories so far.');

				} else {
					logger.warn('skipping category:_cid (lacking row._name):' + row._cid);
					storedCategory.skipped = row || {_cid: row._cid};
				}
				_cids.push(row._cid);
				storage.setItem('c.' + row._cid, storedCategory, function(err){
					if (err) throw err;
					i++;
					// todo [async-going-sync-hack]
					setTimeout(function(){done();}, 1);
				});
			}
		}, function () {
			logger.info('Preparing categories done. normalized ' + kept + '/' + rows.length);
			callback(_cids);
		});
	},

	exportUsers: function (next) {
		var _self = this,
			prefix = this.config.tablePrefix,
			query = 'SELECT '
				+ prefix + 'members.id_member as _uid, '
				+ prefix + 'members.member_name as _username, '
				+ prefix + 'members.real_name as _alternativeUsername, '
				+ prefix + 'members.email_address as _registrationEmail, '
				//+ prefix + 'users.user_rank as _level, '
				+ prefix + 'members.date_registered as _joindate, '
				+ prefix + 'members.email_address as _email '
				//+ prefix + 'banlist.ban_id as _banned '
				//+ prefix + 'USER_PROFILE.USER_SIGNATURE as _signature, '
				//+ prefix + 'USER_PROFILE.USER_HOMEPAGE as _website, '
				//+ prefix + 'USER_PROFILE.USER_OCCUPATION as _occupation, '
				//+ prefix + 'USER_PROFILE.USER_LOCATION as _location, '
				//+ prefix + 'USER_PROFILE.USER_AVATAR as _picture, '
				//+ prefix + 'USER_PROFILE.USER_TITLE as _title, '
				//+ prefix + 'USER_PROFILE.USER_RATING as _reputation, '
				//+ prefix + 'USER_PROFILE.USER_TOTAL_RATES as _profileviews, '
				//+ prefix + 'USER_PROFILE.USER_BIRTHDAY as _birthday '

				+ 'FROM ' + prefix + 'members '
				+ 'WHERE ' + prefix + 'members.id_member = ' + prefix + 'members.id_member '

				+ (this.config.timeMachine.users.before ?
				'AND ' + prefix + 'members.date_registered < ' + this.config.timeMachine.users.before : ' ')

				+ (this.config.timeMachine.users.after ?
				'AND ' + prefix + 'members.date_registered >= ' + this.config.timeMachine.users.after : ' ');

		this.c.query(query, function(err, rows) {
			if (err) throw err;
			_self.logger.info('Users query came back with ' + rows.length + ' records, now normalizing, please be patient.');
			_self._normalizeUsers(rows, function(_uids) {
				_self.mem._uids = _uids;
				_self.logger.info('now writing users array to disk, please be patient');
				storage.setItem('_uids.json', _self.mem._uids, next);
			});
		});
	},

	_normalizeUsers: function (rows, callback) {
		var _self = this,
			kept = 0, i = 0,
			logger = this.logger,
			startTime = +new Date(),
			_uids = [];

		async.eachLimit(rows, 5, function(row, done) {
			var storedUser = storage.getItem('u.' + row._uid) || {};
			if (storedUser.normalized || storedUser.skipped) {
				logger.debug('[c:' + row._uid + '] user:_uid: ' + row._uid + ' already normalized');
				_uids.push(row._uid);

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1);
			} else {
				if (row._username && row._email) {
					// nbb forces signatures to be less than 150 chars
					// keeping it HTML see https://github.com/akhoury/nodebb-plugin-import#markdown-note
					row._signature = _self._truncateStr(row._signature || '', 150);
					// from unix timestamp (s) to JS timestamp (ms)
					row._joindate = ((row._joindate || 0) * 1000) || startTime;
					// lower case the email for consistency
					row._email = row._email.toLowerCase();
					// I don't know about you about I noticed a lot my users have incomplete urls, urls like: http://
					row._picture = _self._validateUrl(row._picture);
					row._website = _self._validateUrl(row._website);
					kept++;
					storedUser.normalized = row;
					if (i % 1000 == 0)
						logger.info('Normalized ' + i + ' users so far.');
				} else {
					if (row._username.indexOf('[Bot]') !== -1 || row._username.indexOf('[Crawler]') !== -1 || row._username.indexOf('[Linkcheck]') !== -1 || row._username.indexOf('[Sitesearch]') !== -1 || row._username.indexOf('[Validator]') !== -1 || row._username.indexOf('[Sitesearch]') !== -1) {
						logger.warn('Skipped bot: ' + row._username + ', user:_uid ' + row._uid);
					} else {
						logger.warn('(!_username || !_email) skipping user:_uid: ' + row._uid);
					}
					storedUser.skipped = row;
				}
				_uids.push(row._uid);
				storage.setItem('u.' + row._uid, storedUser, function(err){
					if (err) throw err;
					i++;

					// todo [async-going-sync-hack]
					setTimeout(function(){done();}, 1);
				});
			}

		}, function(){

			logger.info('Normalizing users done. normalized ' + kept + '/' + rows.length);
			// harcode that first user
			storage.setItem('u.1', {normalized: {_uid: 1}}, function(){
				callback(_uids);
			});
		});
	},

	exportTopics: function (next) {
		var _self = this,
			prefix = this.config.tablePrefix,
			query =
				'SELECT '
					+ prefix + 'messages.id_topic as _tid, '
					+ prefix + 'messages.id_board as _cid, '

					// this is the 'parent-post'
					// see https://github.com/akhoury/nodebb-plugin-import#important-note-on-topics-and-posts
					// I don't really need it since I just do a simple join and get its content, but I will include for the reference
					// remember this post EXCLUDED in the exportPosts() function
					+ prefix + 'topics.id_first_message as _pid, '

					+ prefix + 'topics.num_views as _viewcount, '
					+ prefix + 'messages.subject as _title, '
					+ prefix + 'messages.poster_time as _timestamp, '

					// maybe use that to skip
					+ prefix + 'messages.approved as _approved, '

					// todo:  figure out what this means,
					+ prefix + 'topics.locked as _status, '

					//+ prefix + 'TOPICS.TOPIC_IS_STICKY as _pinned, '
					+ prefix + 'messages.id_member as _uid, '
					// this should be == to the _tid on top of this query
					+ prefix + 'messages.id_topic as _post_tid, '

					// and there is the content I need !!
					+ prefix + 'messages.body as _content '

					+ 'FROM ' + prefix + 'topics, ' + prefix + 'messages '
					// see
					+ 'WHERE ' + prefix + 'topics.id_first_message=' + prefix + 'messages.id_msg '

					+ (_self.config.timeMachine.topics.before ?
					'AND ' + prefix + 'messages.poster_time < ' + _self.config.timeMachine.topics.before : ' ')
					+ (_self.config.timeMachine.topics.after ?
					'AND ' + prefix + 'messages.poster_time >= ' + _self.config.timeMachine.topics.after : ' ');

		this.c.query(query,
			function(err, rows) {
				if (err) throw err;
				_self.logger.info('Topics query came back with ' + rows.length + ' records, now normalizing, please be patient.');
				_self._normalizeTopics(rows, function(_tids){
					_self.mem._tids = _tids;
					_self.logger.info('now writing topics array to disk, please be patient');
					storage.setItem('_tids.json', _self.mem._tids, next);
				});
			});
	},

	_normalizeTopics: function (rows, callback) {
		var _self = this,
			logger = this.logger,
			kept = 0, i = 0,
			startTime = +new Date(),
			_tids = [];

		async.eachLimit(rows, 5, function(row, done) {
			var storedTopic = storage.getItem('t.' + row._tid) || {};
			if (storedTopic.normalized || storedTopic.skipped) {
				logger.debug('[c:' + i + '] topic:_tid: ' + row._tid + ' already normalized');
				_tids.push(row._tid);

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1);
			} else {
				var normalizedCategory = (storage.getItem('c.' + row._cid) || {}).normalized;
				var normalizedUser = (storage.getItem('u.' + row._uid) || {}).normalized;

				if (/*normalizedCategory && */ normalizedUser) {

					row._title = row._title ? row._title[0].toUpperCase() + row._title.substr(1) : 'Untitled';
					// from s to ms
					row._timestamp = ((row._timestamp || 0) * 1000) || startTime;

					kept++;
					storedTopic.normalized = row;

					if (i % 1000 == 0)
						logger.info('Normalized ' + i + ' topics so far.');
				} else {
					var requiredValues = [normalizedCategory, normalizedUser];
					var requiredKeys = ['normalizedCategory','normalizedUser'];
					var falsyIndex = _self._whichIsFalsy(requiredValues);
					logger.warn('Skipping topic:_tid: ' + row._tid + ' titled: ' + row._title + ' because ' + requiredKeys[falsyIndex] + ' is falsy. Value: ' + requiredValues[falsyIndex]);
					storedTopic.skipped = row;
				}
				_tids.push(row._tid);
				storage.setItem('t.' + row._tid, storedTopic, function(){
					i++;

					// todo [async-going-sync-hack]
					setTimeout(function(){done();}, 1);
				});
			}
		}, function(){
			logger.info('Normalizing topics done. normalized ' + kept + '/' + rows.length);
			callback(_tids);
		});
	},

	exportPosts: function (next) {
		var _self = this,
			prefix = this.config.tablePrefix,
			query = 
				'SELECT ' + prefix + 'messages.id_msg as _pid, '
					//+ 'POST_PARENT_ID as _post_replying_to, ' phpbb doesn't have "reply to another post"
					+ prefix + 'messages.id_topic as _tid, '
					+ prefix + 'messages.poster_time as _timestamp, '
					// not being used
					+ prefix + 'messages.subject as _subject, '

					+ prefix + 'messages.body as _content, '
					+ prefix + 'messages.id_member as _uid, '

					// I couldnt tell what's the different, they're all HTML to me
					//+ prefix + 'POST_MARKUP_TYPE as _markup, '
					// maybe use this one to skip
					+ prefix + 'messages.approved as _approved '

					+ 'FROM ' + prefix + 'messages '
					// this post cannot be a its topic's main post, it MUST be a reply-post
					// see https://github.com/akhoury/nodebb-plugin-import#important-note-on-topics-and-posts
					+ 'WHERE ' + prefix + 'messages.id_topic > 0 AND ' + prefix + 'messages.id_msg NOT IN (SELECT id_first_msg FROM ' + prefix + 'topics) ' // phpBB doesn't have post parent ID (phpBB migrator checks if 0)

					+ (this.config.timeMachine.posts.before ?
					'AND messages.poster_time < ' + this.config.timeMachine.posts.before : ' ')
					+ (this.config.timeMachine.posts.after ?
					'AND messages.poster_time >= ' + this.config.timeMachine.posts.after : ' ');

		this.c.query(query, function(err, rows) {
			if (err) throw err;
			_self.logger.info('Posts query came back with ' + rows.length + ' records, now normalizing, please be patient.');
			_self._normalizePosts(rows, function(_pids){
				_self.mem._pids = _pids;
				_self.logger.info('now writing posts array to disk, please be patient');
				storage.setItem('_pids.json', _self.mem._pids, next);
			});
		});
	},

	_normalizePosts: function (rows, callback) {
		var _self = this,
			logger = this.logger,
			kept = 0, i = 0,
			startTime = +new Date(),
			_pids = [];

		async.eachLimit(rows, 5, function(row, done) {
			var storedPost = storage.getItem('p.' + row._pid) || {};
			if (storedPost.normalized || storedPost.skipped) {
				logger.debug('[c:' + i + '] post: ' + row._pid + ' already normalized');
				_pids.push(row._pid);

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1);
			} else {

				var normalizedTopic = (storage.getItem('t.' + row._tid) || {}).normalized;
				var normalizedUser = (storage.getItem('u.' + row._uid) || {}).normalized;

				if (normalizedTopic && normalizedUser && row._content) {

					// from s to ms
					row._timestamp = ((row._timestamp || 0) * 1000) || startTime;

					storedPost.normalized = row;
					kept++;
					if (i % 1000 == 0)
						logger.info('Normalized ' + i + ' posts so far.');

				} else {
					var requiredValues = [normalizedTopic, normalizedUser, row._content];
					var requiredKeys = ['normalizedTopic', 'normalizedUser', 'row._content'];
					var falsyIndex = _self._whichIsFalsy(requiredValues);

					logger.warn('Skipping post:_pid: ' + row._pid + ' because ' + requiredKeys[falsyIndex] + ' is falsy. Value: ' + requiredValues[falsyIndex]);
					storedPost.skipped = row;
				}

				_pids.push(row._pid);
				storage.setItem('p.' + row._pid, storedPost, function(){
					i++;

					// todo [async-going-sync-hack]
					setTimeout(function(){done();}, 1);
				});
			}
		}, function(){
			logger.info('Normalizing posts done. normalized ' + kept + '/' + rows.length + '\n\n\n');
			callback(_pids);
		});
	},

	setup: function(next) {
		this.logger.debug('setup()');
		// temp memory
		this.mem = {
			_cids: [],
			_uids: [],
			_tids: [],
			_pids: []
		};

		if (!this.config.db) throw new Error('config.db needs to be set');
		this.mem.startTime = +new Date();

		// mysql connection to phpBB database
		this.c = mysql.createConnection(this.config.db);
		this.c.connect();

		next();
	},

	report: function(next) {
		var logger = this.logger;

		logger.raw('\n\n====  REMEMBER:\n'
			+ '\n\t*-) Email all your users their new passwords'
			+ '\n\t*-) All the content is still in HTML');

		logger.raw('\n\nFind a gazillion file to use with nodebb-plugin-import here: ' + this.config.storageDir + '\n');
		logger.raw('These files have a pattern u.[_uid], c.[_cid], t.[_tid], p.[_pid], \'cat\' one of each to view the structure.\n');
		logger.info('DONE, Took ' + ((+new Date() - this.mem.startTime) / 1000 / 60).toFixed(2) + ' minutes.');
		next();
	},

	exit: function(code, msg){
		code = this._isNumber(code) ? code : 0;
		this.logger.info('Exiting ... code: ' + code + ( msg ? ' msg: ' + msg : '') );
		process.exit(code);
	},

	// which of the values is falsy
	_whichIsFalsy: function(arr){
		for (var i = 0; i < arr.length; i++) {
			if (!arr[i])
				return i;
		}
		return null;
	},

	_truncateStr: function (str, len) {
		if (typeof str != 'string') return str;
		len = this._isNumber(len) && len > 3 ? len : 20;
		return str.length <= len ? str : str.substr(0, len - 3) + '...';
	},

	_isNumber: function (n) {
		return !isNaN(parseFloat(n)) && isFinite(n);
	},

	// stolen from Angular https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L11
	// maybe I should just require it
	_validateUrl: function (url) {
		var pattern = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
		return url && url.length < 2083 && url.match(pattern) ? url : '';
	}
};

module.exports = Export;
