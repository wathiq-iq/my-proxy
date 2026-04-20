// todo.js

// Function to get tasks from local storage
function getTasks() {
    return JSON.parse(localStorage.getItem('tasks')) || [];
}

// Function to save tasks to local storage
function saveTasks(tasks) {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

// Function to add a task
function addTask(task) {
    const tasks = getTasks();
    tasks.push({ task: task, completed: false });
    saveTasks(tasks);
}

// Function to delete a task
function deleteTask(index) {
    const tasks = getTasks();
    tasks.splice(index, 1);
    saveTasks(tasks);
}

// Function to mark a task as complete
function markComplete(index) {
    const tasks = getTasks();
    tasks[index].completed = true;
    saveTasks(tasks);
}

// Function to display tasks
function displayTasks() {
    const tasks = getTasks();
    tasks.forEach((task, index) => {
        console.log(`${index + 1}. ${task.task} [${task.completed ? '✓' : ' '}]`);
    });
}

// Example usage:
addTask('Learn JavaScript');
displayTasks();
markComplete(0);
displayTasks();
deleteTask(0);
displayTasks();