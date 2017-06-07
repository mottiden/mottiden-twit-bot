const co = require('co');
const schedule = require('node-schedule');
const nasabot = require('./src/nasabot');
const followbot = require('./src/followbot');

const j = schedule.scheduleJob('30 23 * * *', function () {
  followbot.followThem();
  console.log('TwitterBot following people executed at ', new Date());
});

const k = schedule.scheduleJob('45 23 1 * *', function () {
  followbot.cleanFollowers();
  console.log('TwitterBot clean followers executed at ', new Date());  
});

const z = schedule.scheduleJob('0 0 * * 7', function () {
  followbot.addFollowers();
  console.log('TwitterBot add followers executed at ', new Date());
});

const n = schedule.scheduleJob('0 18 * * *', function () {
  nasabot();
  console.log('TwitterBot nasabot followers executed at ', new Date());
});


/**
Features:
✔ Follow people from a list
✔ Add all the people I follow on a private list and mute them
✔ given a list of twitter users, add their followers to a data store
✔ check the database for followers who haven't followed back within 30 days and unfollow them
✔ (Cool Nasa)  Every day post a Nasa photo https://api.nasa.gov/
- (Free love) Between randomly 5 times per day like random followers posts
- (Free hugs) Pick one of people I am following and tell them that they are great DM!
- (Whassup) Five times a day re-tweet interesting followers posts
- (Follow up) When someone follows or mentions, delay follow back
- (Free art) Twice per day tweet images created algorithmically
- (Cool Dev Jokes) Once per week tweet funny devs jokes
- (Coolors) Tweet a color palett. Generate also random ones
- (Cool Gify) Every day post a gif https://github.com/Giphy/GiphyAPI
- (Cool Unsplash) Every day post a Unsplash https://unsplash.com/developers
- (Cool Product Hunt) Every third day https://api.producthunt.com/v1/docs?ref=producthunt
- (My health) Every day post my avg heart- beat and step count https://dev.fitbit.com/eu
- (Sharing cool music) Every day from specific hashtags https://developers.soundcloud.com/docs/api/guide
- Tweets every new article on jacopoparvizi.com
  - Tweets every poster or song on justhumans
**/

