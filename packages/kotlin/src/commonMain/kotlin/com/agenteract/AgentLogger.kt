package com.agenteract

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock

object AgentLogger {
    private val logs = mutableListOf<LogEntry>()
    private val mutex = Mutex()

    suspend fun log(message: String) {
        println(message) // Also print to std out
        mutex.withLock {
            logs.add(LogEntry(
                level = "info",
                message = message,
                timestamp = Clock.System.now().toEpochMilliseconds().toDouble()
            ))
            if (logs.size > 1000) {
                logs.removeAt(0)
            }
        }
    }

    suspend fun getLogs(): List<LogEntry> {
        mutex.withLock {
            return logs.toList()
        }
    }
    
    suspend fun clear() {
        mutex.withLock {
            logs.clear()
        }
    }
}
