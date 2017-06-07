const Twit = require('twit');
const request = require('request');
const fs = require('fs');
const config = require('./config');
const path = require('path');

const bot = new Twit(config);

function saveFile(body, fileName) {
  const file = fs.createWriteStream(fileName);
  request(body).pipe(file).on('close', (err) => {
    if (err) {
      console.log(err);
    } else {
      console.log('NASA photo saved!');
      const descriptionText = body.title;
      uploadMedia(descriptionText, fileName);
    }
  });
}

function uploadMedia(descriptionText, fileName) {
  const filePath = path.join(__dirname, `../${fileName}`);
  console.log(`uploadMedia: file PATH ${fileName}`);
  bot.postMediaChunked({
    file_path: filePath,
  }, (err, data, response) => {
    if (err) {
      console.log(err);
    } else {
      console.log(data);
      const params = {
        status: `${descriptionText} #awesome #space #scifi #nasa`,
        media_ids: data.media_id_string,
      }
      postStatus(params);
    }
  })
}

function postStatus(params) {
  bot.post('statuses/update', params, (err, data, response) => {
    if (err) {
      console.log(err);
    } else {
      console.log('Status: posted!');
    }
  });
}

function stripEmbed(url) {
  return url.replace('embed', 'watch');
}

const getPhoto = () => {
  const parameters = {
    url: 'https://api.nasa.gov/planetary/apod',
    qs: {
      api_key: process.env.NASA_KEY,
    },
    encoding: 'binary',
  };
  request.get(parameters, (err, response, body) => {
    body = JSON.parse(body);
    console.log(body);
    if (body.media_type === 'video') {
      const params = {
        status: `${body.title} #awesome #space #scifi #nasa: ${stripEmbed(body.url)}`,
      };
      postStatus(params);
    }
    else {
      saveFile(body, 'nasa.jpg');
    }
  });
};

module.exports = getPhoto;
