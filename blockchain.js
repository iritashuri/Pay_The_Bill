const sha256 = require('sha256');
const currentNodeUrl = process.argv[3];
const currentNodPort = process.argv[2];
const uuid = require('uuid/v1');

function Blockchain() {
    this.chain = [];
    this.pendingTransactions = [];

    this.currentNodeUrl = currentNodeUrl;
    this.networkNodes = [];
    this.createNewBlock(100, '0', '0');
    this.bills = [];
};
//get current node host name
Blockchain.prototype.getName = function () {
    if (currentNodPort === "3010") {
        return "Electic company"
    } else if (this.currentNodPort === "3009") {
        return "Arnona"
    } else if (this.currentNodPort === "3008") {
        return "Water"
    } else return this.currentNodPort
};

//get current node bills
Blockchain.prototype.getBills = function () {
    return this.bills;
};

//after minig - creating new block with pending transacrions
Blockchain.prototype.createNewBlock = function (nonce, previousBlockHash, hash) {
    const newBlock = {
        index: this.chain.length + 1,
        timestamp: Date.now(),
        transactions: this.pendingTransactions,
        nonce: nonce,
        hash: hash,
        previousBlockHash: previousBlockHash
    };

    this.pendingTransactions = [];
    this.chain.push(newBlock);

    return newBlock;
};

//get the last block was mined
Blockchain.prototype.getLastBlock = function () {
    return this.chain[this.chain.length - 1];
};

//creating new transactions
Blockchain.prototype.createNewTransaction = function (amount, sender, recipient) {
    const newTransaction = {
        amount: amount,
        sender: sender,
        recipient: recipient,
        transactionId: uuid().split('-').join('')
    };


    return newTransaction;
};

//adding new transacrion to pending transactions array
Blockchain.prototype.addTransactionToPendingTransactions = function (transactionObj) {
    this.pendingTransactions.push(transactionObj);
    return this.getLastBlock()['index'] + 1;
};


//sender request money from recipient
Blockchain.prototype.createNewBill = function (amount, sender, recipient) {
    const newBill = {
        amount: amount,
        senderAddress: sender,
        senderName: this.getName(),
        recipient: recipient,
    };


    return newBill;
};

//after creating a bill - add it to the bills array for the fetch node
Blockchain.prototype.addBillToBills = function (billObj) {
    this.bills.push(billObj);
    return this.bills.length + 1;
};

//after payment - romive the bill from the array 
Blockchain.prototype.removeBill = function (index) {
    this.bills.splice(index, 1);
};


//creat hash to block with sha256
Blockchain.prototype.hashBlock = function (previousBlockHash, currentBlockData, nonce) {
    const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
    const hash = sha256(dataAsString);
    return hash;
};

//create fiting nonce - that will suplay 4 times "0" in the begining 
Blockchain.prototype.proofOfWork = function (previousBlockHash, currentBlockData) {
    let nonce = 0;
    let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
    while (hash.substring(0, 4) !== '0000') {
        nonce++;
        hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
    }

    return nonce;
};


//chceck cahin validation 
Blockchain.prototype.chainIsValid = function (blockchain) {
    let validChain = true;

    for (var i = 1; i < blockchain.length; i++) {
        const currentBlock = blockchain[i];
        const prevBlock = blockchain[i - 1];
        const blockHash = this.hashBlock(prevBlock['hash'], {
            transactions: currentBlock['transactions'],
            index: currentBlock['index']
        }, currentBlock['nonce']);
        if (blockHash.substring(0, 4) !== '0000') validChain = false;
        if (currentBlock['previousBlockHash'] !== prevBlock['hash']) validChain = false;
    };

    const genesisBlock = blockchain[0];
    const correctNonce = genesisBlock['nonce'] === 100;
    const correctPreviousBlockHash = genesisBlock['previousBlockHash'] === '0';
    const correctHash = genesisBlock['hash'] === '0';
    const correctTransactions = genesisBlock['transactions'].length === 0;

    if (!correctNonce || !correctPreviousBlockHash || !correctHash || !correctTransactions) validChain = false;

    return validChain;
};

//get block according his hash
Blockchain.prototype.getBlock = function (blockHash) {
    let correctBlock = null;
    this.chain.forEach(block => {
        if (block.hash === blockHash) correctBlock = block;
    });
    return correctBlock;
};

//get transaction accordin the transaction id
Blockchain.prototype.getTransaction = function (transactionId) {
    let correctTransaction = null;
    let correctBlock = null;

    this.chain.forEach(block => {
        block.transactions.forEach(transaction => {
            if (transaction.transactionId === transactionId) {
                correctTransaction = transaction;
                correctBlock = block;
            };
        });
    });

    return {
        transaction: correctTransaction,
        block: correctBlock
    };
};

//get data for specific address
Blockchain.prototype.getAddressData = function (address) {
    const addressTransactions = [];
    this.chain.forEach(block => {
        block.transactions.forEach(transaction => {
            if (transaction.sender === address || transaction.recipient === address) {
                addressTransactions.push(transaction);
            };
        });
    });

    let balance = this.getBalace(address);

    return {
        addressTransactions: addressTransactions,
        addressBalance: balance
    };
};

//get specific address balance
Blockchain.prototype.getBalace = function (address) {
    const addressTransactions = [];
    this.chain.forEach(block => {
        block.transactions.forEach(transaction => {
            if (transaction.sender === address || transaction.recipient === address) {
                addressTransactions.push(transaction);
            };
        });
    });
    this.pendingTransactions.forEach(transaction => {
        if (transaction.sender == address) {
            addressTransactions.push(transaction);
        };

    });

    let balance = 100;
    addressTransactions.forEach(transaction => {
        if (transaction.recipient == address) balance += transaction.amount;
        else if (transaction.sender == address) balance -= transaction.amount;
    });
    return balance;

}

module.exports = Blockchain;