import express from 'express'
import { MongoClient } from 'mongodb'
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const app = express()

app.use(express.static('public'))

const homepagePath = fileURLToPath(
	new URL('./public/index.html', import.meta.url),
)

app.get('/', (req, res) => {
	res.sendFile(homepagePath)
})

const PORT = Number(process.env.PORT) || 3000
const LOGIN = process.env.MOODLE_LOGIN
const FULL_NAME = process.env.FULL_NAME
const API_TOKEN = process.env.API_TOKEN

const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = process.env.DB_NAME

if (!MONGODB_URI || !DB_NAME) {
	throw new Error('MongoDB settings are missing')
}

if (!LOGIN || !FULL_NAME || !API_TOKEN) {
	throw new Error('Missing settings in .env')
}

const mongoClient = new MongoClient(MONGODB_URI, {
	serverSelectionTimeoutMS: 10000,
})

let dbPromise = null

async function getDb() {
	if (!dbPromise) {
		dbPromise = (async () => {
			await mongoClient.connect()

			const db = mongoClient.db(DB_NAME)

			await db.command({ ping: 1 })

			await db.collection('tasks').createIndex({ id: 1 }, { unique: true })

			return db
		})().catch(error => {
			dbPromise = null
			throw error
		})
	}

	return dbPromise
}

app.get('/login/', (req, res) => {
	res.type('text/plain')
	res.status(200).send(LOGIN)
})

app.use('/api/', (req, res, next) => {
	const authorization = req.get('Authorization')

	if (authorization !== `Bearer ${API_TOKEN}`) {
		return res.status(401).json({
			error: 'Unauthorized',
		})
	}

	next()
})

app.use('/api/', express.json())

app.get('/api/author/', (req, res) => {
	res.status(200).json({
		login: LOGIN,
		fullName: FULL_NAME,
	})
})

app.use('/api/tasks/', async (req, res, next) => {
	try {
		req.app.locals.db = await getDb()
		next()
	} catch (error) {
		console.error('MongoDB connection failed:', error.message)

		return res.status(503).json({
			error: 'Database unavailable',
		})
	}
})

app.post('/api/tasks/', async (req, res) => {
	const body = req.body

	if (
		!body ||
		typeof body !== 'object' ||
		Array.isArray(body) ||
		Object.keys(body).length !== 2 ||
		!Object.hasOwn(body, 'title') ||
		!Object.hasOwn(body, 'runId')
	) {
		return res.status(400).json({
			error: 'Expected title and runId only',
		})
	}

	const { title, runId } = body

	if (
		typeof title !== 'string' ||
		title.trim().length === 0 ||
		[...title.trim()].length > 200
	) {
		return res.status(400).json({
			error: 'Invalid title',
		})
	}

	if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
		return res.status(400).json({
			error: 'Invalid runId',
		})
	}

	const task = {
		id: randomUUID(),
		ownerLogin: LOGIN,
		title: title.trim(),
		done: false,
		runId: runId,
		createdAt: new Date().toISOString(),
	}

	try {
		const db = req.app.locals.db

		await db.collection('tasks').insertOne({
			...task,
		})

		return res.status(201).json(task)
	} catch (error) {
		console.error('Database error:', error.message)

		return res.status(503).json({
			error: 'Database unavailable',
		})
	}
})

const taskProjection = {
	_id: 0,
	id: 1,
	ownerLogin: 1,
	title: 1,
	done: 1,
	runId: 1,
	createdAt: 1,
}

app.get('/api/tasks/', async (req, res) => {
	const runId = req.query.runId

	if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
		return res.status(400).json({
			error: 'Invalid or missing runId',
		})
	}

	try {
		const db = req.app.locals.db

		const tasks = await db
			.collection('tasks')
			.find({
				ownerLogin: LOGIN,
				runId: runId,
			})
			.project(taskProjection)
			.sort({ createdAt: 1 })
			.toArray()

		return res.status(200).json(tasks)
	} catch (error) {
		console.error('Database error:', error.message)

		return res.status(503).json({
			error: 'Database unavailable',
		})
	}
})

app.get('/api/tasks/:id/', async (req, res) => {
	const id = req.params.id

	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

	if (!uuidPattern.test(id)) {
		return res.status(400).json({
			error: 'Invalid UUID',
		})
	}

	try {
		const db = req.app.locals.db

		const task = await db.collection('tasks').findOne(
			{
				id: id,
				ownerLogin: LOGIN,
			},
			{
				projection: taskProjection,
			},
		)

		if (!task) {
			return res.status(404).json({
				error: 'Task not found',
			})
		}

		return res.status(200).json(task)
	} catch (error) {
		console.error('Database error:', error.message)

		return res.status(503).json({
			error: 'Database unavailable',
		})
	}
})

app.patch('/api/tasks/:id/', async (req, res) => {
	const id = req.params.id
	const body = req.body

	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

	if (!uuidPattern.test(id)) {
		return res.status(400).json({
			error: 'Invalid UUID',
		})
	}

	if (
		!body ||
		typeof body !== 'object' ||
		Array.isArray(body) ||
		Object.keys(body).length === 0 ||
		Object.keys(body).some(key => !['title', 'done'].includes(key))
	) {
		return res.status(400).json({
			error: 'Expected title and/or done only',
		})
	}

	if (
		Object.hasOwn(body, 'title') &&
		(typeof body.title !== 'string' ||
			body.title.trim().length === 0 ||
			[...body.title.trim()].length > 200)
	) {
		return res.status(400).json({
			error: 'Invalid title',
		})
	}

	if (Object.hasOwn(body, 'done') && typeof body.done !== 'boolean') {
		return res.status(400).json({
			error: 'Invalid done',
		})
	}

	const updates = {}

	if (Object.hasOwn(body, 'title')) {
		updates.title = body.title.trim()
	}

	if (Object.hasOwn(body, 'done')) {
		updates.done = body.done
	}

	try {
		const db = req.app.locals.db

		const task = await db.collection('tasks').findOneAndUpdate(
			{
				id: id,
				ownerLogin: LOGIN,
			},
			{
				$set: updates,
			},
			{
				returnDocument: 'after',
				projection: taskProjection,
			},
		)

		if (!task) {
			return res.status(404).json({
				error: 'Task not found',
			})
		}

		return res.status(200).json(task)
	} catch (error) {
		console.error('Database error:', error.message)

		return res.status(503).json({
			error: 'Database unavailable',
		})
	}
})

app.delete('/api/tasks/:id/', async (req, res) => {
	const id = req.params.id

	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

	if (!uuidPattern.test(id)) {
		return res.status(400).json({
			error: 'Invalid UUID',
		})
	}

	try {
		const db = req.app.locals.db

		const result = await db.collection('tasks').deleteOne({
			id: id,
			ownerLogin: LOGIN,
		})

		if (result.deletedCount === 0) {
			return res.status(404).json({
				error: 'Task not found',
			})
		}

		return res.status(204).send()
	} catch (error) {
		console.error('Database error:', error.message)

		return res.status(503).json({
			error: 'Database unavailable',
		})
	}
})

app.use('/api/', (err, req, res, next) => {
	if (err.type === 'entity.parse.failed') {
		return res.status(400).json({
			error: 'Invalid JSON',
		})
	}

	console.error('API error:', err.message)

	return res.status(500).json({
		error: 'Internal server error',
	})
})

export default app

if (!process.env.VERCEL) {
	getDb()
		.then(() => {
			app.listen(PORT, '127.0.0.1', () => {
				console.log(`Server started on port ${PORT}`)
			})
		})
		.catch(async error => {
			console.error('Database connection failed:', error.message)

			await mongoClient.close()
			process.exitCode = 1
		})
}
