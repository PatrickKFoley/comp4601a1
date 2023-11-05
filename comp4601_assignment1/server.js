const express = require('express');
const mc = require("mongodb").MongoClient;
const elasticlunr = require("elasticlunr")
const {Matrix} = require("ml-matrix")
const axios = require('axios');

const app = express();

let fruitsIndex;
let fruitsPageRanksUrls;

let personalIndex;
let personalPageRanksUrls;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// Automatically parse JSON data
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended: true, limit: '50mb'}));
app.use(express.static("public"));

// GET FRUIT
app.get("/fruits", async function(req, res, next) {
    if(req.url == "/fruits") {
        const client = await mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true});
        const db = client.db('crawlerLoot');

        const result = await db.collection("fruits").find().toArray();
            
        res.status(200).json(result);
        client.close();
        return;
    }

    let queryParts = extractQueries(req.url);
    let { q, boost, limit, url } = queryParts;

    console.log(queryParts)

    if (url) {
        const client = await mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true});
        const db = client.db('crawlerLoot');

        const result = await db.collection("fruits").findOne({url: { $regex: new RegExp(url, "i") }});
        
        res.status(200).json(result);
        client.close();
        return;
    }
    
    if(!limit || limit < 1 || limit > 50) {
        limit = 10;
    }


    const pageRanksArray = await fruitsPageRanksUrls.then(response => {return response})
    let pages = fruitsIndex.search(q, {});

    // FOR BOOSTED RESULTS
    if (boost == "true") {
        const result = pages.map((pageEntry) => {
            const [pageRank, ref] = pageRanksArray.find(([score, r]) => r === pageEntry.ref);
            return { ref, score: pageEntry.score * pageRank}
        })
    
        pages = result.sort(function(a, b) {return a.score - b.score}).reverse()
    }

    // FOR LIMITED RESULTS
    pages = pages.slice(0, limit)
    
    // GET MORE DATA ABOUT PAGES
    const client = await mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true});
    let db = client.db('crawlerLoot');

    let newPages = []
    for (let page of pages) {
        const result = await db.collection("fruits").findOne({url: { $regex: new RegExp(page.ref, "i") }});

        let newPage = {
            ...page,
            url: result.url,
            title: result.title,
            pr: result.pageRank,
            name: "Group Members: Aiden Molyneaux & Patrick Kye Foley"
        }

        newPages.push(newPage);
    }
    client.close()

    // SEND PAGES
    res.status(200).json(newPages);
})

app.get("/personal", async function(req, res, next) {
    if(req.url == "/personal") {
        const client = await mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true});
        const db = client.db('crawlerLoot');

        const result = await db.collection("personal").find().toArray();
            
        res.status(200).json(result);
        client.close();
        return;
    }

    let queryParts = extractQueries(req.url);
    let { q, boost, limit, url } = queryParts;

    
    if (url) {
        let result
        const client = await mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true});

        try {
            const db = client.db('crawlerLoot');
            result = await db.collection("personal").findOne({url: { $regex: new RegExp(url, "i") }});

        } finally {
            res.status(200).json(result);
            client.close();
            return;
            }
    }
    
    if(!limit || limit < 1 || limit > 50) {
        limit = 10;
    }

    const pageRanksArray = await personalPageRanksUrls.then(response => {return response})

    let pages = personalIndex.search(q, {})

    if (boost == "true") {
        const result = pages.map((pageEntry) => {
            const [pageRank, ref] = pageRanksArray.find(([score, r]) => r === pageEntry.ref);
            return { ref, score: pageEntry.score * pageRank}
        })
    
        pages = result.sort(function(a, b) {return a.score - b.score}).reverse()
    }

    pages = pages.slice(0, limit)
    let newPages = []
    const client = await mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true});

    let db = client.db('crawlerLoot');

    for (let page of pages) {
        const result = await db.collection("personal").findOne({url: { $regex: new RegExp(page.ref, "i") }});

        let newPage = {
            ...page,
            url: result.url,
            title: result.title,
            pr: result.pageRank,
            name: "Group Members: Aiden Molyneaux & Patrick Kye Foley"
        }

        newPages.push(newPage);
    }
    
    client.close()
    res.status(200).json(newPages);
})

app.get("/pages", async function(req, res) {
    let pageTitle = req.url.split("?")[1].split("=")[1]
    console.log(pageTitle)

    const client = new mc("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true})
    try {
        await client.connect()

        let page = await client.db('crawlerLoot').collection('fruits').findOne({title: pageTitle})
        let personal = false

        if (!page) {
            personal = true
            pageTitle = pageTitle.replace(/%20/g, " ").replace(/%27/g, "'") + " - Wikipedia"
            page = await client.db('crawlerLoot').collection('personal').findOne({title: pageTitle})
        }

        let allWords = []
        let pageWords = page.body.split("\n")

        if (personal) {
            for (let placeholder of pageWords) {
                placeholder.replace(/[^a-zA-Z]/g, '')
                allWords.push(placeholder.split(" "))
            }
        } else {
            allWords = pageWords
        }

        let wordsAndCounts = []

        if (personal) {
            for await (let wordArr of allWords) {
                for await (let word of wordArr) {
                    // skip any empty strings
                    if (word == "") {
                        continue
                    }
        
                    // assume this word has not been seen
                    let wordPresent = false
        
                    // check if this word has been seen
                    for (let wordCount of wordsAndCounts) {
                        if (word.toLowerCase() == wordCount[0].toLowerCase()) {
                            wordCount[1] += 1;
                            wordPresent = true;
                        }
                    }
        
                    // if this word has not been seen, make a new entry
                    if (!wordPresent) {
                        wordsAndCounts.push([word, 1])
                    }
                }
            }
        } else {
            for await (let word of allWords) {
                // skip any empty strings
                if (word == "") {
                    continue
                }
    
                // assume this word has not been seen
                let wordPresent = false
    
                // check if this word has been seen
                for (let wordCount of wordsAndCounts) {
                    if (word == wordCount[0]) {
                        wordCount[1] += 1
                        wordPresent = true
                    }
                }
    
                // if this word has not been seen, make a new entry
                if (!wordPresent) {
                    wordsAndCounts.push([word, 1])
                }
            }
        }

        wordsAndCounts.sort(function(a, b) {return a[1] - b[1]}).reverse()
        page.wordsAndCounts = wordsAndCounts

        res.status(200).json(page)
    } finally {
        client.close()
    }
})

// Extract all queries from url
function extractQueries(url){
	let query = url.split("?")[1];
	let parts = query.split("&");
    let queryParts = {};
  
    let newParts = [];
    parts.forEach((part) => {
        newParts.push(part.replace(/%20/g, " "));
    });
  
	for(let i = 0; i < newParts.length; i++){
		if(newParts[i].startsWith("q=")){
			queryParts.q = newParts[i].split("=")[1];
		}
        else if(newParts[i].startsWith("boost=")) {
            queryParts.boost = newParts[i].split("=")[1];
        }
        else if(newParts[i].startsWith("limit=")) {
            queryParts.limit = Number(newParts[i].split("=")[1]);
        }
        else if(newParts[i].startsWith("url=")) {
            queryParts.url = newParts[i].split("=")[1].substring(0, newParts[i].split("=")[1].length - 3);
        }
	}

	return queryParts;
}

// Update pages
app.patch("/fruits/:ID", updatePage)
app.patch("/personal/ID", updatePage)


async function updatePage(req, res, next) {
    const client = new mc("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true}) 
    let result
    await client.connect()
    
    try {
        const db = client.db("crawlerLoot"); 

        // update current page
        if (req.body.linksTo != null) {
            result = await db.collection(req.body.dbName).updateOne({url: req.body.url}, { $set: {linksTo: req.body.linksTo, body: req.body.body, title: req.body.title}})
        }

        // update child page
        else {
            result = await db.collection(req.body.dbName).updateOne({url: req.body.url}, { $push: {linkedBy: req.body.linkedBy}, $inc: {linkedByCount: 1}})
        }
    } finally {
        client.close()
        res.status(200).send(result)
    }
}

// Create a page
app.post("/fruits", addPage);
app.post("/personal", addPage)

async function addPage(req, res, next) {
    let pages = req.body
    console.log(pages[0].dbName)
    console.log(pages.length)

    let result
    const client = mc("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true})
    try {
        console.log("DB LOG (connected) - posting a page resource.");
        await client.connect()
        
        //Select the database by name
        let db = client.db('crawlerLoot');
        result = await db.collection(pages[0].dbName).insertMany(pages)
    } finally {
        client.close();
        res.status(200).json(result);
    }
}

// clear the database for re-crawling
function emptyDatabase() {
    mc.connect("mongodb://localhost:27017/", {useUnifiedTopology: true}, async function(err, client) {
        if (err) throw err;

        let db = client.db('crawlerLoot');
        try {
            db.collection('fruits').deleteMany({});
            db.collection('personal').deleteMany({});
        } catch (err) {
            console.error('Error querying MongoDB: ', err)
        }
    });
}

// add all documents to index
app.get("/done", addPagesToIndexCrawler)

function addPagesToIndexCrawler(req, res) {
    let collectionName = req.url.split("?")[1].split("=")[1]

    let index = elasticlunr(function () {
        this.addField("title")
        this.addField("body")
        this.setRef("url")
    })

    mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true}, function(err, client) {
        if (err) throw err;

        let db = client.db('crawlerLoot');

        db.collection(collectionName).find({}, {title: 1, body: 1, url: 1, _id: 0}).toArray(async function(err, result) {
            if (err) throw err;

            let counter = 0
            for (page of result) {
                index.addDoc(page)
                counter += 1
            }
            
            if (collectionName == "fruits") {
                fruitsIndex = index
                fruitsPageRanksUrls = await pageRank("fruits")
                await addPageRanksToDb(fruitsPageRanksUrls, "fruits")
            } else {
                personalIndex = index
                personalPageRanksUrls = await pageRank("personal")
                await addPageRanksToDb(personalPageRanksUrls, "personal")
            }

            res.status(200).send()
            client.close();
        });
    })
}

async function addPagesToIndex(collectionName) {
    index = elasticlunr(function () {
        this.addField('title')
        this.addField('body')
        this.setRef('url')
    })

    const client = new mc("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true})
    try {
        await client.connect()

        let db = client.db('crawlerLoot');
        const result = await db.collection(collectionName).find({}, {url: 1, title: 1, body: 1, _id: 0}).toArray()

        // if (collectionName == "personal") {
        //     page.body = "In       under Cowling s leadership  Carleton began an official affiliation with the Minnesota Baptist Convention"
        // }

        for (page of result) {
            index.addDoc(page)
        }
    } finally {
        client.close()
    }

    return index
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get("/popular", function(req, res, next) {
    mc.connect("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true}, function(err, client) {
        if (err) throw err;
        // console.log("DB LOG (connected) - requesting most popular pages.");

        let db = client.db('crawlerLoot');

        db.collection("fruits").find().sort({linkedByCount: -1}).limit(10).toArray(function(err, result) {
            if (err) throw err;

            res.status(200).json(result);

            client.close();
        });
    });
})

function euclidean(A, B) {
    let total = 0
    for (let i = 0; i < A.columns; i++) {
        total += (A.get(0, i) - B.get(0, i))**2
    }

    return Math.sqrt(total)
}

async function pageRank(collectionName) {
    // starting adjacency matrix
    let basicAdjMat = []
    // num pages
    let N = 0
    // grab all urls in order as we do this - combined with pageRank before sorting
    let urlsInOrder = []

    // build basic adjacency matrix with Ai,j = 1 if page i links to page j
    console.log("Creating adjacency matrix...")
    const client = new mc("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true}, {useUnifiedTopology: true})
    try {
        await client.connect()
        const outerPageCursor = client.db('crawlerLoot').collection(collectionName).find()

        for await (const page of outerPageCursor) {
            let row = []
            const innerPageCursor = client.db('crawlerLoot').collection(collectionName).find()
            
            for await (const childPage of innerPageCursor) {
                (page.linksTo.includes(childPage.url)) ? row.push(1) : row.push(0)
            }

            basicAdjMat.push(row)
            urlsInOrder.push(page.url)
            N += 1
        }
    } finally {
        client.close()
    }
    console.log("Adjacency matrix created!")

    // second stage of adjacency matrix creation
    // if a row has 1s, replace all 1s with 1 / number of 1s
    // if a row has no 1s, replace all elements with 1 / number of pages
    let stage2AdjMat = []
    for (let row of basicAdjMat) {
        // count the number of 1s in this row
        let num1s = 0
        for (let element of row) {
            if (element == 1) {
                num1s += 1
            }
        }

        let newRow = []
        // if there is no 1s, replace all entries with 1 / number of pages
        if (num1s == 0) {
            for (let element of row) {
                newRow.push(1 / N)
            }

        // if there are 1s, replace all 1s with 1 / number of 1s
        } else {
            for (let element of row) {
                (element == 1) ? newRow.push(1 / num1s) : newRow.push(0)
            }
        }
        stage2AdjMat.push(newRow)
    }
    console.log("Stage 2 (row modification) complete!")

    // third stage of adjacency matrix creation
    // multiply adjacency matrix by (1 - alpha)
    // get values back into 2d array
    let alpha = 0.1
    let stage3AdjMatTemp = Matrix.mul(new Matrix(stage2AdjMat), (1 - alpha))
    let stage3AdjMat = []
    for (let i = 0; i < stage3AdjMatTemp.rows; i++) {
        let newRow = []
        for (let j = 0; j < stage3AdjMatTemp.columns; j++) {
            newRow.push(stage3AdjMatTemp.get(i, j))
        }
        stage3AdjMat.push(newRow)
    }
    console.log("Stage 3 (matrix multiplication by 1 - alpha) complete!")

    // fourth stage of adjacency matrix creation
    // add (alpha / N) to each element of the adjacency matrix
    let stage4AdjMat = []
    for (let row of stage3AdjMat) {
        let newRow = []
        for (let element of row) {
            newRow.push(element + (alpha / N))
        }
        stage4AdjMat.push(newRow)
    }
    console.log("Stage 4 (element addition by alpha / numPages) complete!")

    // create initial page rank vector 
    let x0 = []
    for (let row in stage4AdjMat) {
        x0.push(0)
    }
    x0[0] = 1

    // create initial matrices
    let probMatrix = new Matrix(stage4AdjMat)
    let prMatrix = new Matrix([x0])
    let prMatrix_old = prMatrix
    prMatrix = prMatrix.mmul(probMatrix)

    // iteratively create page rank matrix
    while (euclidean(prMatrix_old, prMatrix) >= 0.0001) {
        prMatrix_old = prMatrix
        prMatrix = prMatrix.mmul(probMatrix)
    }
    console.log("Stage 5 (power iteration) complete!")

    // grab PageRank values
    let pageRanks = []
    for (let i = 0; i < prMatrix.columns; i++) {
        pageRanks.push(prMatrix.get(0, i))
    }

    // combine PageRanks and urls then sort
    let pageRanksUrls = []
    pageRanks.forEach((rank, index) => {
        pageRanksUrls.push([rank, urlsInOrder[index]])
    })
    pageRanksUrls.sort(function(a, b) {return a[0] - b[0]}).reverse()

    // print sorted page ranks
    // console.log("25 highest PageRank values:")
    // for (let i = 0; i < 25; i++) {
    //     console.log("#" + (i+1) + ". (" + pageRanksUrls[i][0].toFixed(16) + ") " + pageRanksUrls[i][1])
    // }

    return pageRanksUrls
}

async function addPageRanksToDb(pageRanks, collectionName) {
    const client = new mc("mongodb://127.0.0.1:27017/", {useUnifiedTopology: true}) 
    try {
        const pageRanksArray = await pageRanks

        await client.connect();
        const db = client.db('crawlerLoot')


        for (rank of pageRanksArray) {
            await db.collection(collectionName).updateOne({url: rank[1]}, {$set: {pageRank: rank[0]}});
        }

    } finally {
        client.close()
    }
}

async function main() {
    try {
        fruitsIndex = await addPagesToIndex("fruits")
        personalIndex = await addPagesToIndex("personal")

        fruitsPageRanksUrls = pageRank("fruits")
        personalPageRanksUrls = pageRank("personal")
    } finally {
        addPageRanksToDb(fruitsPageRanksUrls, "fruits")
        addPageRanksToDb(personalPageRanksUrls, "personal")
    }
}

// emptyDatabase();

main()
app.listen(3000);

axios.put(
    "http://134.117.130.17:3000/searchengines",
    JSON.stringify({ request_url: "http://134.117.131.137:3000" }),
    { headers: {"Content-Type": "application/json"}}
).then(r => console.log(r.status)).catch(e => console.log(e))

console.log("Server listening at http://localhost:3000");