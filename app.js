var Client = require('mongodb').MongoClient;

var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var multer = require('multer'); 
var upload = multer({ dest: __dirname+'/uploads/', 
        fileFilter: function(req, file, cb){
            if(req.session.user_id==null) {
                cb(null, false);
            }
        }   
    });
var iconvLite = require('iconv-lite');
var crypto = require('crypto');
var session = require('express-session');

app.use(bodyParser.urlencoded({extended : true}));
app.use(session({
    key: 'sid',
    secret: process.env.KEY,
    resave: false,
    saveUninitialized: true
}));

function getUserIP(req){
    var ipAddress;

    if(!!req.hasOwnProperty('sessionID')){
        ipAddress = req.headers['x-forwarded-for'];
    } else{
        if(!ipAddress){
            var forwardedIpsStr = req.header('x-forwarded-for');

            if(forwardedIpsStr){
                var forwardedIps = forwardedIpsStr.split(',');
                ipAddress = forwardedIps[0];
            }
            if(!ipAddress){
                ipAddress = req.connection.remoteAddress;
            }
        }
    }
    return ipAddress;
}
function getDownloadFilename(req, filename) {
    var header = req.headers['user-agent'];
 
    if (header.includes("MSIE") || header.includes("Trident")) { 
        return encodeURIComponent(filename).replace(/\\+/gi, "%20");
    } else if (header.includes("Chrome")) {
        return iconvLite.decode(iconvLite.encode(filename, "UTF-8"), 'ISO-8859-1');
    } else if (header.includes("Opera")) {
        return iconvLite.decode(iconvLite.encode(filename, "UTF-8"), 'ISO-8859-1');
    } else if (header.includes("Firefox")) {
        return iconvLite.decode(iconvLite.encode(filename, "UTF-8"), 'ISO-8859-1');
    }
 
    return filename;
}

app.post('/upload', upload.array('file',100), function(req, res){
    if(req.session.user_id==null) res.end('fail');
    else{
        Client.connect('mongodb://localhost:27017/dropbox', function(error, db) {
            if(error) console.log(error);
            else {
                var cnt=0;
                for(var i=0;i<req.files.length;i++){
                    var json=req.files[i];
                    json._id=crypto.createHash('md5').update(String(json.filename)).digest("hex");
                    json.ip=getUserIP(req);
                    json.date=String(Date.now());
                    db.collection('file').insertOne(json,function(doc, err){
                        if(err) console.log(err);
                        cnt+=1;
                        if(cnt==req.files.length) {
                            db.close();
                            res.send("ok");
                        }
                    });
                }
            }
        });
    }
});
  
app.get('/download/:id', function(req, res){
    var key=req.params.id;
    Client.connect('mongodb://localhost:27017/dropbox', function(error, db) {
        if(error) console.log(error);
        else {
            key=key.trimLeft().trimRight().trim();
            db.collection('file').findOne({_id:key},function(err, obj){
                if(err) console.log(err);
                if(obj){
                    res.setHeader('Content-disposition', 'attachment; filename=\"'+getDownloadFilename(req,obj.originalname).replace(/ /gi,"_")+'\"');
                    res.setHeader('Content-type', obj.mimetype);

                    var filestream = fs.createReadStream(obj.path);
                    filestream.pipe(res);
                }else  res.send("download fail");
            });
            db.close();
        }
    });
});

app.post('/list', function(req, res){
    Client.connect('mongodb://localhost:27017/dropbox', function(error, db) {
        if(error) console.log(error);
        else {
            var list = new Array();
            db.collection('file').find().each(function(err, obj){
                if(err) console.log(err);
                if(obj){
                    var data = new Object();
                    data.code=obj._id;
                    data.type=obj.mimetype;
                    data.size=obj.size;
                    data.date=obj.date;
                    data.filename=obj.originalname;
                    list.push(data);
                }else{
                    var jsonData = JSON.stringify(list);
                    db.close();
                    res.send(jsonData);
                }
            });
        }
    });
});

app.post('/delete', function(req, res){
    var key=String(req.body.id);
    Client.connect('mongodb://localhost:27017/dropbox', function(error, db) {
        if(error) console.log(error);
        else {
            db.collection('file').finfindOned({_id:key}, function(err, obj){
                if(err) console.log(err);
                if(obj){
                    fs.unlink(obj.path);
                    db.collection('file').deleteOne({_id:key},function(err, obj){
                        if(err) console.log(err);
                        db.close();
                        res.send("ok");
                    });
                }
            });
        }
    });
});

app.post('/login', function(req, res){
    var id=String(req.body.id);
    var pw=String(req.body.pw);
    Client.connect('mongodb://localhost:27017/dropbox', function(error, db) {
        if(error) console.log(error);
        else {
            db.collection('user').find({$and:[{id:id},{pw:pw}]}).toArray(function(err, doc){
                if(err) console.log(err);
                if(doc[0]){
                    req.session.user_id=doc[0].id;
                    db.close();
                    res.send("ok");
                }
                else res.send("fail");
            });
        }
    });
});

app.listen(8002);