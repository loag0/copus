const express = require('express');

const app = express();
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