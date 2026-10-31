const tokenInput = document.getElementById('token')
const runIdInput = document.getElementById('runId')
const loadButton = document.getElementById('load')
const taskList = document.getElementById('taskList')
const status = document.getElementById('status')

loadButton.addEventListener('click', async () => {
	const token = tokenInput.value.trim()
	const runId = runIdInput.value.trim()

	if (!token) {
		status.textContent = 'Сначала введи токен'
		return
	}

	taskList.replaceChildren()
	status.textContent = 'Загружаем задачи...'

	try {
		const response = await fetch(
			`/api/tasks/?runId=${encodeURIComponent(runId)}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		)

		const data = await response.json()

		if (!response.ok) {
			status.textContent = data.error || 'Ошибка запроса'
			return
		}

		for (const task of data) {
			const item = document.createElement('li')

			const checkbox = document.createElement('input')
			checkbox.type = 'checkbox'
			checkbox.checked = task.done
			checkbox.setAttribute('aria-label', `Выполнена: ${task.title}`)

			const titleSpan = document.createElement('span')
			titleSpan.textContent = task.title
			titleSpan.className = 'task-title'

			if (task.done) {
				titleSpan.classList.add('task-done')
			}

			item.appendChild(checkbox)
			item.appendChild(titleSpan)

			checkbox.addEventListener('change', async () => {
				checkbox.disabled = true

				try {
					const response = await fetch(`/api/tasks/${task.id}/`, {
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							done: checkbox.checked,
						}),
					})

					const updatedTask = await response.json()

					if (!response.ok) {
						throw new Error(updatedTask.error || 'Ошибка изменения')
					}

					task.done = updatedTask.done
					checkbox.checked = updatedTask.done
					titleSpan.classList.toggle('task-done', updatedTask.done)

					status.textContent = 'Статус задачи сохранён'
				} catch (error) {
					checkbox.checked = task.done
					status.textContent = `Ошибка: ${error.message}`
				} finally {
					checkbox.disabled = false
				}
			})

			const isRequiredTask =
				task.runId === 'manual' &&
				task.title === 'Итоговая работа 24.10.2026: vremeninet'

			if (!isRequiredTask) {
				const editButton = document.createElement('button')
				editButton.textContent = 'Изменить'

				editButton.addEventListener('click', async () => {
					const newTitle = prompt('Новое название задачи:', task.title)

					// Пользователь нажал «Отмена»
					if (newTitle === null) {
						return
					}

					const title = newTitle.trim()

					if (!title || [...title].length > 200) {
						status.textContent =
							'Название должно содержать от 1 до 200 символов'
						return
					}

					if (title === task.title) {
						return
					}

					editButton.disabled = true

					try {
						const response = await fetch(`/api/tasks/${task.id}/`, {
							method: 'PATCH',
							headers: {
								Authorization: `Bearer ${token}`,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								title: title,
							}),
						})

						const updatedTask = await response.json()

						if (!response.ok) {
							throw new Error(updatedTask.error || 'Не удалось изменить задачу')
						}

						task.title = updatedTask.title
						titleSpan.textContent = updatedTask.title

						checkbox.setAttribute(
							'aria-label',
							`Выполнена: ${updatedTask.title}`,
						)

						status.textContent = 'Название задачи сохранено'
					} catch (error) {
						status.textContent = `Ошибка: ${error.message}`
					} finally {
						editButton.disabled = false
					}
				})

				item.appendChild(editButton)

				const deleteButton = document.createElement('button')
				deleteButton.textContent = 'Удалить'

				deleteButton.addEventListener('click', async () => {
					const confirmed = confirm(`Удалить задачу «${task.title}»?`)

					if (!confirmed) {
						return
					}

					deleteButton.disabled = true

					try {
						const response = await fetch(`/api/tasks/${task.id}/`, {
							method: 'DELETE',
							headers: {
								Authorization: `Bearer ${token}`,
							},
						})

						if (!response.ok) {
							const errorData = await response.json()
							throw new Error(errorData.error || 'Ошибка удаления')
						}

						item.remove()
						status.textContent = `Задача удалена. Осталось: ${taskList.children.length}`
					} catch (error) {
						status.textContent = `Ошибка: ${error.message}`
					} finally {
						deleteButton.disabled = false
					}
				})

				item.appendChild(deleteButton)
			}

			taskList.appendChild(item)
		}

		status.textContent = `Задач найдено: ${data.length}`
	} catch (error) {
		status.textContent = `Ошибка соединения: ${error.message}`
	}
})

const newTitleInput = document.getElementById('newTitle')
const addButton = document.getElementById('add')

addButton.addEventListener('click', async () => {
	const token = tokenInput.value.trim()
	const title = newTitleInput.value.trim()
	const runId = runIdInput.value.trim()

	if (!token) {
		status.textContent = 'Сначала введи токен'
		return
	}

	if (!title || [...title].length > 200) {
		status.textContent = 'Название должно содержать от 1 до 200 символов'
		return
	}

	addButton.disabled = true

	try {
		const response = await fetch('/api/tasks/', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				title: title,
				runId: runId,
			}),
		})

		const data = await response.json()

		if (!response.ok) {
			status.textContent = data.error || 'Не удалось создать задачу'
			return
		}

		newTitleInput.value = ''
		loadButton.click()
	} catch (error) {
		status.textContent = `Ошибка соединения: ${error.message}`
	} finally {
		addButton.disabled = false
	}
})
