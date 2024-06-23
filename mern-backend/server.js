const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/transactionsDB', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

// Define models
const transactionSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: Number,
    dateOfSale: Date,
    category: String,
    sold: Boolean
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Fetch and initialize the database
app.get('/api/init', async (req, res) => {
    try {
        const { data } = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        await Transaction.deleteMany({});
        await Transaction.insertMany(data);
        res.status(200).send('Database initialized');
    } catch (error) {
        res.status(500).send('Error initializing database');
    }
});

// List all transactions with search and pagination
app.get('/api/transactions', async (req, res) => {
    const { month, page = 1, perPage = 10, search = '' } = req.query;

    const regex = new RegExp(search, 'i');
    const startOfMonth = new Date(2022, month - 1, 1);
    const endOfMonth = new Date(2022, month, 0);

    try {
        const transactions = await Transaction.find({
            dateOfSale: { $gte: startOfMonth, $lte: endOfMonth },
            $or: [
                { title: regex },
                { description: regex },
                { price: regex }
            ]
        })
            .skip((page - 1) * perPage)
            .limit(Number(perPage));

        res.json(transactions);
    } catch (error) {
        res.status(500).send('Error fetching transactions');
    }
});

// API for statistics
app.get('/api/statistics', async (req, res) => {
    const { month } = req.query;

    const startOfMonth = new Date(2022, month - 1, 1);
    const endOfMonth = new Date(2022, month, 0);

    try {
        const totalSaleAmount = await Transaction.aggregate([
            { $match: { dateOfSale: { $gte: startOfMonth, $lte: endOfMonth }, sold: true } },
            { $group: { _id: null, total: { $sum: '$price' } } }
        ]);

        const totalSoldItems = await Transaction.countDocuments({
            dateOfSale: { $gte: startOfMonth, $lte: endOfMonth },
            sold: true
        });

        const totalNotSoldItems = await Transaction.countDocuments({
            dateOfSale: { $gte: startOfMonth, $lte: endOfMonth },
            sold: false
        });

        res.json({
            totalSaleAmount: totalSaleAmount[0]?.total || 0,
            totalSoldItems,
            totalNotSoldItems
        });
    } catch (error) {
        res.status(500).send('Error fetching statistics');
    }
});

// API for bar chart data
app.get('/api/bar-chart', async (req, res) => {
    const { month } = req.query;

    const startOfMonth = new Date(2022, month - 1, 1);
    const endOfMonth = new Date(2022, month, 0);

    const priceRanges = [
        { range: '0-100', min: 0, max: 100 },
        { range: '101-200', min: 101, max: 200 },
        { range: '201-300', min: 201, max: 300 },
        { range: '301-400', min: 301, max: 400 },
        { range: '401-500', min: 401, max: 500 },
        { range: '501-600', min: 501, max: 600 },
        { range: '601-700', min: 601, max: 700 },
        { range: '701-800', min: 701, max: 800 },
        { range: '801-900', min: 801, max: 900 },
        { range: '901-above', min: 901, max: Infinity }
    ];

    try {
        const result = await Promise.all(priceRanges.map(async ({ range, min, max }) => {
            const count = await Transaction.countDocuments({
                dateOfSale: { $gte: startOfMonth, $lte: endOfMonth },
                price: { $gte: min, $lte: max }
            });
            return { range, count };
        }));

        res.json(result);
    } catch (error) {
        res.status(500).send('Error fetching bar chart data');
    }
});

// API for pie chart data
app.get('/api/pie-chart', async (req, res) => {
    const { month } = req.query;

    const startOfMonth = new Date(2022, month - 1, 1);
    const endOfMonth = new Date(2022, month, 0);

    try {
        const result = await Transaction.aggregate([
            { $match: { dateOfSale: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        res.json(result);
    } catch (error) {
        res.status(500).send('Error fetching pie chart data');
    }
});

// API to fetch combined data
app.get('/api/combined-data', async (req, res) => {
    try {
        const [transactions, statistics, barChart, pieChart] = await Promise.all([
            axios.get('http://localhost:5000/api/transactions', { params: req.query }),
            axios.get('http://localhost:5000/api/statistics', { params: req.query }),
            axios.get('http://localhost:5000/api/bar-chart', { params: req.query }),
            axios.get('http://localhost:5000/api/pie-chart', { params: req.query })
        ]);

        res.json({
            transactions: transactions.data,
            statistics: statistics.data,
            barChart: barChart.data,
            pieChart: pieChart.data
        });
    } catch (error) {
        res.status(500).send('Error fetching combined data');
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
