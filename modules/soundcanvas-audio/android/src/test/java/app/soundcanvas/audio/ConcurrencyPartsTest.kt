package app.soundcanvas.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class InferenceSlotTest {
  /** Holds tasks until the test runs them, like an inference that is still working. */
  private class ManualExecutor : Executor {
    val pending = ArrayDeque<Runnable>()
    override fun execute(command: Runnable) {
      pending.addLast(command)
    }
    fun runNext() = pending.removeFirst().run()
  }

  @Test
  fun `only one inference is in flight and windows arriving meanwhile are dropped`() {
    val executor = ManualExecutor()
    val slot = InferenceSlot(executor)
    val ran = ArrayList<Int>()
    assertTrue(slot.offer { ran.add(1) })
    assertFalse(slot.offer { ran.add(2) })
    assertFalse(slot.offer { ran.add(3) })
    assertEquals(1, executor.pending.size) // bounded: never a backlog
    executor.runNext()
    assertTrue(slot.offer { ran.add(4) })
    executor.runNext()
    assertEquals(listOf(1, 4), ran)
    assertEquals(2L, slot.submittedCount)
    assertEquals(2L, slot.droppedCount)
  }

  @Test
  fun `a failing inference frees the slot`() {
    val executor = ManualExecutor()
    val slot = InferenceSlot(executor)
    slot.offer { throw IllegalStateException("boom") }
    runCatching { executor.runNext() }
    assertTrue(slot.offer { })
  }

  @Test
  fun `a shut-down executor rejects without wedging the slot`() {
    var reject = true
    val slot = InferenceSlot { if (reject) throw RejectedExecutionException() else it.run() }
    assertFalse(slot.offer { })
    reject = false
    assertTrue(slot.offer { })
  }

  @Test
  fun `under load the capture side never waits`() {
    val inference = Executors.newSingleThreadExecutor()
    val slot = InferenceSlot(inference)
    val release = CountDownLatch(1)
    slot.offer { release.await() }
    val started = System.nanoTime()
    repeat(1000) { slot.offer { } }
    val elapsedMs = (System.nanoTime() - started) / 1e6
    release.countDown()
    inference.shutdown()
    assertTrue(inference.awaitTermination(1, TimeUnit.SECONDS))
    assertEquals(1000L, slot.droppedCount)
    assertTrue("offers took $elapsedMs ms", elapsedMs < 200)
  }
}

class SessionGateTest {
  @Test
  fun `events of a stopped session are never emitted`() {
    val gate = SessionGate()
    val first = gate.open()
    val seen = ArrayList<String>()
    assertTrue(gate.emitIfCurrent(first) { seen.add("a") })
    gate.close()
    assertFalse(gate.emitIfCurrent(first) { seen.add("late") })
    val second = gate.open()
    assertFalse("a restart must not revive the old epoch", gate.emitIfCurrent(first) { seen.add("stale") })
    assertTrue(gate.emitIfCurrent(second) { seen.add("b") })
    assertEquals(listOf("a", "b"), seen)
  }

  @Test
  fun `close is idempotent`() {
    val gate = SessionGate()
    val epoch = gate.open()
    gate.close()
    gate.close()
    assertFalse(gate.isCurrent(epoch))
  }

  @Test
  fun `no emission can slip in after close returns`() {
    val gate = SessionGate()
    val epoch = gate.open()
    val emitter = Executors.newSingleThreadExecutor()
    val closed = AtomicBoolean(false)
    val lateEmission = AtomicBoolean(false)
    val running = CountDownLatch(1)
    emitter.execute {
      running.countDown()
      while (!lateEmission.get()) {
        val emitted = gate.emitIfCurrent(epoch) { if (closed.get()) lateEmission.set(true) }
        if (!emitted) break
      }
    }
    running.await()
    gate.close()
    closed.set(true)
    emitter.shutdown()
    assertTrue(emitter.awaitTermination(1, TimeUnit.SECONDS))
    assertFalse(lateEmission.get())
  }
}
