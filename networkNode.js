const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const uuid = require('uuid/v1');
const port = process.argv[2];
const rp = require('request-promise');
const cors = require('cors')
const sha256 = require('sha256');

const nodeAddress = sha256(port);
app.use(express.static('./'))
const ipay = new Blockchain();
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.set("view options", {
    layout: false
});
app.use(cors())
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
const nodeName = ipay.getName();
// get entire blockchain
app.get('/blockchain', function (req, res) {
    res.send(ipay);
});

app.get('/name', function (req, res) {
    res.send(ipay.getName());
});

/*
app.get('/blockchain/myBill', function (req, res) {
    res.send(myBills);
})
*/
app.get('/myAddress', function (req, res) {
    res.json({
        address: nodeAddress,
        getBalace: ipay.getBalace(nodeAddress)
    })
});



// create a new transaction
app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    const blockIndex = ipay.addTransactionToPendingTransactions(newTransaction);
    res.json({
        note: `Transaction will be added in block ${blockIndex}.`
    });
});


// broadcast payed transaction - client buy coins
app.post('/transaction/pay', function (req, res) {
    const newTransaction = ipay.createNewTransaction(req.body.amount, "00", nodeAddress);
    ipay.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    ipay.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            res.json({
                note: 'Transaction created and broadcast successfully.'
            });
        });
});



// broadcast reward transaction
app.post('/transaction/reward', function (req, res) {
    const newTransaction = ipay.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    ipay.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    ipay.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            res.json({
                note: 'Transaction created and broadcast successfully.'
            });
        });
});

// broadcast transaction
app.post('/transaction/broadcast', function (req, res) {
    if (ipay.getBalace(nodeAddress) - req.body.amount >= 0) {

        const newTransaction = ipay.createNewTransaction(req.body.amount, nodeAddress, req.body.recipient);
        ipay.addTransactionToPendingTransactions(newTransaction);

        const requestPromises = [];
        ipay.networkNodes.forEach(networkNodeUrl => {
            const requestOptions = {
                uri: networkNodeUrl + '/transaction',
                method: 'POST',
                body: newTransaction,
                json: true
            };

            requestPromises.push(rp(requestOptions));
        });

        Promise.all(requestPromises)

            .then(data => {
                res.json({
                    success: true,
                    note: 'Transaction created and broadcast successfully.'
                });
            });
        ipay.bills.forEach(bill => {
            if (newTransaction.recipient === bill.senderAddress && newTransaction.amount === bill.amount) {
                ipay.removeBill(ipay.bills.indexOf(bill));
            }
        })

    } else {
        res.json({
            success: false,
            note: 'no money in your account, your balance is: ' + ipay.getBalace(nodeAddress)
        });
    }
});


//create new bill document
app.post('/bill', function (req, res) {
    const newBill = req.body;
    const billIndex = ipay.addBillToBills(newBill);
    res.json({
        note: `Billn will be added in Bills ${billIndex}.`
    });
});


//ask money from your client
app.post('/create-document-payment', function (req, res) {
    const newBill = ipay.createNewBill(req.body.amount, nodeAddress, req.body.recipient);

    const requestPromises = [];
    const recipient = req.body.recipient;

    ipay.networkNodes.forEach(networkNodeUrl => {
        const nodePort = networkNodeUrl.substring(17, 21);
        if (sha256(nodePort) === recipient) {
            const requestOptions = {
                uri: networkNodeUrl + '/bill',
                method: 'POST',
                body: newBill,
                json: true
            };

            requestPromises.push(rp(requestOptions));
        }

    });

    Promise.all(requestPromises)
        .then(data => {
            res.json({
                note: 'Bill created and broadcast successfully.',
                amount: req.body.amount,
                senderName: nodeName,
                senderAddress: nodeAddress
            });
        });

});




// mine a block
app.get('/mine', function (req, res) {
    const lastBlock = ipay.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: ipay.pendingTransactions,
        index: lastBlock['index'] + 1
    };
    const nonce = ipay.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = ipay.hashBlock(previousBlockHash, currentBlockData, nonce);
    const newBlock = ipay.createNewBlock(nonce, previousBlockHash, blockHash);

    const requestPromises = [];
    ipay.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: {
                newBlock: newBlock
            },
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(data => {
            const requestOptions = {
                uri: ipay.currentNodeUrl + '/transaction/reward',
                method: 'POST',
                body: {
                    amount: 12.5,
                    sender: "00",
                    recipient: nodeAddress
                },
                json: true
            };
            return rp(requestOptions);
        })
        .then(data => {
            res.json({
                note: "New block mined & broadcast successfully",
                block: newBlock
            });
        });
});


// receive new block
app.post('/receive-new-block', function (req, res) {
    const newBlock = req.body.newBlock;
    const lastBlock = ipay.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if (correctHash && correctIndex) {
        ipay.chain.push(newBlock);
        ipay.pendingTransactions = [];
        res.json({
            note: 'New block received and accepted.',
            newBlock: newBlock
        });
    } else {
        res.json({
            note: 'New block rejected.',
            newBlock: newBlock
        });
    }
});


// register a node and broadcast it the network
app.post('/register-and-broadcast-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (ipay.networkNodes.indexOf(newNodeUrl) == -1) ipay.networkNodes.push(newNodeUrl);

    const regNodesPromises = [];
    ipay.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body: {
                newNodeUrl: newNodeUrl
            },
            json: true
        };

        regNodesPromises.push(rp(requestOptions));
    });

    Promise.all(regNodesPromises)
        .then(data => {
            const bulkRegisterOptions = {
                uri: newNodeUrl + '/register-nodes-bulk',
                method: 'POST',
                body: {
                    allNetworkNodes: [...ipay.networkNodes, ipay.currentNodeUrl]
                },
                json: true
            };

            return rp(bulkRegisterOptions);
        })
        .then(data => {
            res.json({
                note: 'New node registered with network successfully.'
            });
        });
});


// register a node with the network
app.post('/register-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = ipay.networkNodes.indexOf(newNodeUrl) == -1;
    const notCurrentNode = ipay.currentNodeUrl !== newNodeUrl;
    if (nodeNotAlreadyPresent && notCurrentNode) ipay.networkNodes.push(newNodeUrl);
    res.json({
        note: 'New node registered successfully.'
    });
});


// register multiple nodes at once
app.post('/register-nodes-bulk', function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
        const nodeNotAlreadyPresent = ipay.networkNodes.indexOf(networkNodeUrl) == -1;
        const notCurrentNode = ipay.currentNodeUrl !== networkNodeUrl;
        if (nodeNotAlreadyPresent && notCurrentNode) ipay.networkNodes.push(networkNodeUrl);
    });

    res.json({
        note: 'Bulk registration successful.'
    });
});


// consensus
app.get('/consensus', function (req, res) {
    const requestPromises = [];
    ipay.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/blockchain',
            method: 'GET',
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
        .then(blockchains => {
            const currentChainLength = ipay.chain.length;
            let maxChainLength = currentChainLength;
            let newLongestChain = null;
            let newPendingTransactions = null;

            blockchains.forEach(blockchain => {
                if (blockchain.chain.length > maxChainLength) {
                    maxChainLength = blockchain.chain.length;
                    newLongestChain = blockchain.chain;
                    newPendingTransactions = blockchain.pendingTransactions;
                };
            });


            if (!newLongestChain || (newLongestChain && !ipay.chainIsValid(newLongestChain))) {
                res.json({
                    note: 'Current chain has not been replaced.',
                    chain: ipay.chain
                });
            } else {
                ipay.chain = newLongestChain;
                ipay.pendingTransactions = newPendingTransactions;
                res.json({
                    note: 'This chain has been replaced.',
                    chain: ipay.chain
                });
            }
        });
});


// get block by blockHash
app.get('/block/:blockHash', function (req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = ipay.getBlock(blockHash);
    res.json({
        block: correctBlock
    });
});


// get transaction by transactionId
app.get('/transaction/:transactionId', function (req, res) {
    const transactionId = req.params.transactionId;
    const trasactionData = ipay.getTransaction(transactionId);
    res.json({
        transaction: trasactionData.transaction,
        block: trasactionData.block
    });
});


// get address by address
app.get('/address/:address', function (req, res) {
    const address = req.params.address;
    const addressData = ipay.getAddressData(address);
    res.json({
        addressData: addressData
    });
});


// block explorer
app.get('/block-explorer', function (req, res) {
    res.sendFile('./payment/blockexplorer.html', {
        root: __dirname
    });
});

// payment page

app.get('/payment', function (req, res) {
    res.sendFile('./payment/index.html', {
        root: __dirname
    })
})

// connected

app.get('/connected', function (req, res) {
    res.render('../payment/connected.html', {
        nodeAddress: nodeAddress,
        balance: ipay.getBalace(nodeAddress)

    });
})

app.get('/myBills', function (req, res) {
    res.render('../payment/myBills.html', {
        bills: JSON.stringify(ipay.getBills()),
        balance: ipay.getBalace(nodeAddress)

    });
})

app.get('/payTheBill', function (req, res) {
    res.sendFile('./payment/payment.html', {
        root: __dirname
    })
})

app.get('/payarnona', function (req, res) {
    res.sendFile('./payment/paymentKinds/payarnona.html', {
        root: __dirname
    })
})
app.get('/paytoelectric', function (req, res) {
    res.sendFile('./payment/paymentKinds/paytoelectric.html', {
        root: __dirname
    })
})
app.get('/paytowatter', function (req, res) {
    res.sendFile('./payment/paymentKinds/paytowatter.html', {
        root: __dirname
    })
})
app.get('/paytoyourfriends', function (req, res) {
    res.sendFile('./payment/paymentKinds/paytoyourfriends.html', {
        root: __dirname
    })
})

app.get('/paiedsuccessfully', function (req, res) {
    res.sendFile('./payment/paymentKinds/paiedsuccessfully.html', {
        root: __dirname
    })
})

app.get('/notpaied', function (req, res) {
    res.sendFile('./payment/paymentKinds/notpaied.html', {
        root: __dirname
    })
})

app.get('/buycoins', function (req, res) {
    res.sendFile('./payment/buycoins.html', {
        root: __dirname
    })
})

app.get('/mined', function (req, res) {
    res.sendFile('./payment/mined.html', {
        root: __dirname
    })
})


app.get('/create-bill', function (req, res) {
    res.sendFile('./payment/creatbill.html', {
        root: __dirname
    })
})

app.get('/created-successfully', function (req, res) {
    res.sendFile('./payment/createdsuccessfully.html', {
        root: __dirname
    })
})

app.get('/got-coins-successfully', function (req, res) {
    res.sendFile('./payment/gotCoinsSuccessfully.html', {
        root: __dirname
    })
})

app.listen(port, function () {
    console.log(`Listening on port ${port}...`);
});