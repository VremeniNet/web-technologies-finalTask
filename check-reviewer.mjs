import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'

const password = process.env.REVIEWER_PASSWORD

if (!password) {
	throw new Error('Reviewer password is missing')
}

const uri =
	`mongodb+srv://todo_reviewer:${encodeURIComponent(password)}` +
	'@cluster0.udp3zez.mongodb.net/'

const client = new MongoClient(uri, {
	serverSelectionTimeoutMS: 10000,
})

const id = randomUUID()

try {
	await client.connect()

	const tasks = client.db('todo_vremeninet').collection('tasks')

	await tasks.findOne({ ownerLogin: 'vremeninet' })
	console.log('READ: OK')

	await tasks.insertOne({
		id,
		ownerLogin: 'vremeninet',
		title: 'Проверка доступа преподавателя',
		done: false,
		runId: 'review_check',
		createdAt: new Date().toISOString(),
	})
	console.log('CREATE: OK')

	const updated = await tasks.updateOne({ id }, { $set: { done: true } })

	if (updated.modifiedCount !== 1) {
		throw new Error('Update failed')
	}
	console.log('UPDATE: OK')

	const deleted = await tasks.deleteOne({ id })

	if (deleted.deletedCount !== 1) {
		throw new Error('Delete failed')
	}
	console.log('DELETE: OK')
} catch (error) {
	console.error('Ошибка:', error.message)
	process.exitCode = 1
} finally {
	await client.close()
}
