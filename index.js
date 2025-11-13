const express = require('express');
const fs = require("fs");
const cors = require('cors');
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use(express.static('public'));

app.get('/', (request, response) => {

    readFile('./index.html', 'utf8', (err, html) => {
        if (err) {
            response.status(500).send("I'll be back soon");
            return;
        }
        response.send(html);
    });
});

app.listen(process.env.PORT || 5500, () => {
    console.log('Server is running... at http://localhost:5500');
});   

const upload = multur({dest: 'uploads/'});

app.post('/convert', upload.single('file'), (request, response) => {
    const file = request.file;
    const format = request.body.format;

    if(format === "opus"){
        //ffmpeg logic for conversion
    }
    else if(format === "ogg"){
        //ffmpeg logic for ogg
    }
    else{
        return response.status(400).json({error: "Invalid format homeboy"});
    }

    //app.put???
});