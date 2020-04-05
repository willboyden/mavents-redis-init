const express = require("express");
const app = express();
const mysql = require("mysql");
const alasql = require("alasql");

const cors = require("cors");
var compression = require("compression");
//allows for environment variables to be set in .env file
require("dotenv").config();

cors("no cors");
app.use(compression());

app.use(express.static("./build"));

const redis = require("redis");
// create and connect redis client to local instance.
const client = redis.createClient(process.env.redisport, process.env.redisip);

// echo redis errors to the consol
client.on("error", err => {
  console.log("Error " + err);
});
//console.log(client)

var corsOptionsDelegate = function(req, callback) {
  var corsOptions;
  corsOptions = { origin: true };
  callback(null, corsOptions); // callback expects two parameters: error and options
};

const lightsaleConnection = mysql.createConnection({
  host: process.env.lightsaledbhost,
  user: process.env.lightsaledbuser,
  password: process.env.lightsaledbpassword,
  database: process.env.lightsaledbdatabase,
  port: process.env.lightsaledbport
});

//check connection
// lightsaleConnection.connect(function(err) {
//   if (err) throw err;
//   console.log("Connected!");
//   lightsaleConnection.end();
// });

getQueryResultAsync = async function(sqlstr) {
  return new Promise(function(resolve, reject) {
    console.log("getQueryResultAsync called");
    lightsaleConnection.query(sqlstr, function(err, rows) {
      if (rows === undefined) {
        console.log(sqlstr);
        reject(new Error("Error rows is undefined" + err));
      } else {
        console.log("hit getQueryResultAsync else statement");
        // console.log(resolve(rows));
        resolve(rows);
      }
    });
  });
};

cacheQueryResultAsync = async function(sqlstr, redisKey) {
  getQueryResultAsync(sqlstr).then(results => {
    if (results) {
      client.set(redisKey, JSON.stringify(results));
      console.log("cached " + redisKey);
    } else {
      console.log("failed " + sqlstr);
    }
  });
};

//function for http response with the result of query
respondQryResultAsync = async function(req, res, func, reqParams) {
  // console.log(func);
  getQueryResultAsync(func(reqParams))
    .then(function(results) {
      // console.log(func(reqParams));
      res.send(results);
    })
    .catch(function(err) {
      console.log("Promise rejection error: " + err);
      res.send("oops");
    });
};

async function createRedisStoreParallel() {
  console.log("creating Redis Store");
  await Promise.all([
    cacheQueryResultAsync(
      `select  \`scrapeDate\`
    ,\`id\`
    ,\`name\`
    ,\`url\`
    ,\`sales_public_startDateTime\`
    ,\`sales_public_endDateTime\`
    ,\`dates_start_localTime\`
    ,\`dates_start_dateTime\`
    ,\`dates_status_code\`
    ,\`links_self_href\`
    ,\`seatmap_staticUrl\`
    ,\`promoter_id\`
    ,\`promoter_name\`
    ,\`promoter_description\`
    ,\`ticketLimit\`
   -- ,\`classifications\`
  --  ,\`priceRanges\`
   -- ,\`_embedded_venues\`
    ,\`family\`
    ,\`segment_name\`
    ,\`genre_name\`
    ,\`subGenre_name\`
    ,\`priceRanges_min\`
    ,\`priceRanges_max\`
    ,\`venue_id\` from tblnewticketmastervenueevent limit 2000`,
      "tblnewticketmastervenueevent"
    ),
    cacheQueryResultAsync("select * from tblstubhubvenue", "tblstubhubvenue"),
    cacheQueryResultAsync(
      "select * from tblnewstubhubvenueevent",
      "tblnewstubhubvenueevent"
    ),
    cacheQueryResultAsync("select * from tblstubhubcity", "tblstubhubcity"),
    cacheQueryResultAsync(
      "select * from tblticketmastervenue",
      "tblticketmastervenue"
    ),
    cacheQueryResultAsync(
      `select distinct 
      tmve.name as eventname
      , tmve.venue_id
      , CAST(tmve.dates_start_dateTime as DATE) as eventdate 
      , tv.name as venuename
      , tv.latitude as latitude
      , tv.longitude as longitude
      , 'ticketmaster' as dataource
      from tblnewticketmastervenueevent tmve
      left join tblticketmastervenue tv on tv.id = tmve.venue_id
      where tv.name not like '%Parking%'
      union
      select distinct sve.name as eventname
      , CAST(sve.eventDate as DATE) as eventdate
      , sve.venue_id
      , sv.name as venuename
      , sc.latitude as latitude
      , sc.longitude as longitude
      , 'stubhub' as datasource
      from tblnewstubhubvenueevent sve
      left join tblstubhubvenue sv on sve.venue_id =sv.id
      left join tblstubhubcity sc on sc.city = sv.city
      where sv.name not like '%Parking%'`,
      "eventlist"
    )
  ])
    .then(console.log("SUCCESSFULLY CREATED REDIS STORE!!!"))
    .catch(err =>
      console.log("ERROR CREATING REDIS STORE -------------" + err.toString())
    );

  client.SAVE();
  // return x;
}

createRedisStoreParallel();
