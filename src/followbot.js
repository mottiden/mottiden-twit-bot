const Twit = require('twit');
const request = require('request');
const fs = require('fs');
const config = require('./config');
const path = require('path');
const monk = require('monk');
const moment = require('moment');
const _ = require('lodash');
const wrap = require('co-monk');
const co = require('co');

const bot = new Twit(config);
const mongo = config.database;

/**
 * MongoDB
 */

const db = monk(mongo);
const dbUser = wrap(db.get('user'));
const dbSeed = wrap(db.get('seed'));


/**
 * Upsert
 */

function* dbUserUpsert(user) {
  console.log('dbUserUpsert');
  const res = yield dbUser.findOne({ id: user.id });
  if (!res) {
    console.log('inserting in user db');
    return yield dbUser.insert(user);
  }
  console.log('already present updating by id');
  // return yield dbUser.updateById(user._id, user);
}


/**
 * Add, but if exists, don't add.
 */

function* dbSeedAdd(seed) {
  console.log('dbSeedAdd');
  const res = yield dbSeed.findOne({ screen_name: seed.screen_name });
  console.log(res);
  if (res) {
    return console.log('it is present');
  } else {
    return yield dbSeed.insert(seed);
  }
}

/**
 * Add seeds (other users whose followers you want to follow.)
 */

function addSeeds(screenNames) {
  for (let i = 0; i < screenNames.length; i++) {
    console.log(i);
    co(dbSeedAdd({
      screen_name: screenNames[i],
      cursor: '-1',
      followers_added: 0,
      all_added: false,
    }));
    console.log('run');
  }
}

function getFriendship(user_id) {
  return function (fn) {
    bot.get('friendships/lookup', { user_id }, (err, data, res) => {
      if (err) fn(err, null);
      if (res.headers['x-rate-limit-remaining'] < 1) fn([{ code: 88, message: 'About to exceed rate limit' }], null);
      fn(null, { data, res });
    });
  };
}

function getFollowers(screen_name, cursor) {
  return function (fn) {
    bot.get('followers/list', { screen_name, cursor, count: 200 }, (err, data, res) => {
      if (err) fn(err, null);
      if (res.headers['x-rate-limit-remaining'] < 1) fn([{ code: 88, message: 'About to exceed rate limit' }], null);
      fn(null, { data, res });
    });
  }
} // navigate using the next_cursor param, max 15 req every 15 min


function* followUser(userId) {
  yield bot.post('friendships/create', {
    user_id: userId,
    follow: 'true',
  }, (err, data, response) => {
    if (err) {
      console.log(err);
    } else {
      console.log(`user ${userId} followed`);
    }
  });
} // limit to 10 - 50 per day randomly

function* unfollowUser(userId) {
  yield bot.post('friendships/destroy', {
    user_id: userId,
  }, (err, data, response) => {
    if (err) {
      console.log(err);
    } else {
      console.log(`user ${userId} unfollowed`);
    }
  });
} // limit to 10 - 50 per day randomly

function* muteUser(userId) {
  yield bot.post('mutes/users/create', {
    user_id: userId,
  }, (err, data, response) => {
    if (err) {
      console.log(err);
    } else {
      console.log(`user ${userId} muted`);
    }
  });
}

// function reTweet(tweetId){
//   bot.post('statuses/retweet/:id', {
//     id: tweetId,
//   }, (err, data, response) => {
//     if (err) {
//       console.log(err);
//     } else {
//       console.log(`${data.text} :retweet success!`);
//     }
//   });
// }

// function likeTweet(tweetId) {
//   bot.post('favorites/create', {
//     id: tweetId,
//   }, (err, data, response) => {
//     if (err) {
//       console.log(err);
//     } else {
//       console.log(`${data.text} :tweet liked!`);
//     }
//   });
// }

function* addToList(userId) {
  yield bot.post('lists/members/create', {
    user_id: userId,
    slug: config.list_name,
    owner_screen_name: config.screen_name,
  }, (err, data, response) => {
    if (err) {
      console.log(err);
    } else {
      console.log(`user ${userId} added to list`);
    }
  });
}

/**
 * Find and add followers to database.
 */

function* follow(num) {
  const users = yield dbUser.find({ followed_at: null }, { sort: { followed_at: -1 } });
  // for (let i = 0; i < users.length; i++) {
  for (let i = 0; i < num; i++) {
    try {
      yield followUser(users[i].id);
      yield muteUser(users[i].id);
      yield addToList(users[i].id);
    } catch (e) {
      if (e.length > 0 && e[0].code === 108) {
        dbUser.remove({ id: users[i].id });
      }
      if (e[0].code === 403) {
        dbUser.remove({ id: users[i].id });
      }
      console.log(e);
      break;
    }
    users[i].followed_at = new Date;
    dbUser.update({ _id: users[i]._id }, users[i]);
  }
  console.log(`Done Following: ${num} users.`);
}

// /**
//  * Find and add followers to database.
//  */

function* unfollow(num) {
  const users = yield dbUser.find({ followed_at: { $exists: true } });
  console.log('users taken from db');
  for (let i = 0; i < num; i++) {
    if (moment().subtract(30, 'days').isBefore(moment(new Date(users[i].followed_at))));
    users[i].unfollowed = true;
    // yield dbUser.updateById(users[i].id, users[i]);
    dbUser.update({ _id: users[i]._id }, users[i]);
    console.log('db updated');
    try {
      const res = yield getFriendship(users[i].id);
      console.log('got friendship');
      if (res.data[0].connections.join('').indexOf('followed_by') >= 0);
      yield unfollowUser(users[i].id);
      console.log('user unfollowed');
    } catch (e) {
      console.log(e);
      break;
    }
  }
  console.log(`Done unfollowing ${num} users`);
}

/**
 * Add followers from seed to database.
 */

function* addFollowers() {
  console.log('started addFollowers');
  const seeds = yield dbSeed.find({ all_added: false });
  console.log('seeds: ', seeds);
  let followers = [];
  for (let i = 0; i < seeds.length; i++) {
    let err = false;
    let iter = 1;
    while (seeds[i].cursor !== '0' && !err && iter <= 10) {
      try {
        console.log('iter: ', iter);
        console.log('screen name: ', seeds[i].screen_name);
        console.log('cursor: ', seeds[i].cursor);
        const res = yield getFollowers(seeds[i].screen_name, seeds[i].cursor);
        console.log(res);
        const users = res.data.users;
        seeds[i].followers_added += Number(users.length);
        seeds[i].cursor = res.data.next_cursor_str;
        iter += 1;
        followers = _.concat(followers, _.filter(users, (user) => {
          let active = !user.default_profile && !user.default_profile_image;
          if (user.status && user.status.created_at) active = active && moment().subtract(7, 'days').isBefore(moment(new Date(user.status.created_at)));
          return active;
        }));
        if (seeds[i].cursor === '0') seeds[i].all_added = true;
      } catch (e) {
        console.log(e);
        err = true;
      }
    }
    if (err) i = seeds.length;
  }
  for (let j = 0; j < followers.length; j++) {
    console.log('adding follower: ', j);
    yield co(dbUserUpsert(followers[j]));
  }
  for (let k = 0; k < seeds.length; k++) {
    console.log('updating seed: ', k);
    seeds[k].all_added = false;
    dbSeed.update({ screen_name: seeds[k].screen_name }, seeds[k]);
  }
}

exports.addFollowers = function () {
  const res = dbUser.find({ followed_at: null });
  if (res.length < 1000) return co(addFollowers());
};// once every 7 days

exports.followThem = function () {
  return co(follow(20));
};// run this function once per day

exports.cleanFollowers = function () {
  return co(unfollow(300));
};// once every 30 days
