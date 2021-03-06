const Promise = require('bluebird')
const assert = require('assert')
const helper = require('./testHelper')
const plans = require('../src/plans')
const PgBoss = require('../')

const ASSERT_DELAY = 9000

describe('schedule', function () {
  it('should publish job based on every minute expression', async function () {
    const queue = 'schedule-every-min'

    const boss = await helper.start(this.test.bossConfig)

    await boss.schedule(queue, '* * * * *')

    await Promise.delay(ASSERT_DELAY)

    const job = await boss.fetch(queue)

    assert(job)

    await boss.stop()
  })

  it('should accept a custom clock monitoring interval in seconds', async function () {
    const queue = 'schedule-custom-monitoring-seconds'

    const config = {
      ...this.test.bossConfig,
      clockMonitorIntervalSeconds: 1
    }

    const boss = await helper.start(config)

    await boss.schedule(queue, '* * * * *')

    await Promise.delay(ASSERT_DELAY)

    const job = await boss.fetch(queue)

    assert(job)

    await boss.stop()
  })

  it('cron monitoring should restart cron if paused', async function () {
    const queue = 'schedule-cron-monitoring'

    const config = {
      ...this.test.bossConfig,
      cronMonitorIntervalSeconds: 1
    }

    const boss = await helper.start(config)

    const { schema } = this.test.bossConfig
    const db = await helper.getDb()
    await db.executeSql(plans.clearStorage(schema))
    await db.executeSql(plans.setCronTime(schema, "now() - interval '1 hour'"))

    await boss.schedule(queue, '* * * * *')

    await Promise.delay(ASSERT_DELAY)

    const job = await boss.fetch(queue)

    assert(job)

    await boss.stop()
  })

  it('should publish job based on every minute expression after a restart', async function () {
    const queue = 'schedule-every-min-restart'

    let boss = await helper.start({ ...this.test.bossConfig, noScheduling: true })

    await boss.schedule(queue, '* * * * *')

    await boss.stop()

    boss = await helper.start(this.test.bossConfig)

    await Promise.delay(ASSERT_DELAY)

    const job = await boss.fetch(queue)

    assert(job)

    await boss.stop()
  })

  it('should remove previously scheduled job', async function () {
    const queue = 'schedule-remove'

    const boss = await helper.start(this.test.bossConfig)

    await boss.schedule(queue, '* * * * *')

    await boss.unschedule(queue)

    await boss.stop()

    const db = await helper.getDb()
    await db.executeSql(plans.clearStorage(this.test.bossConfig.schema))

    await boss.start()

    await Promise.delay(ASSERT_DELAY)

    const job = await boss.fetch(queue)

    assert(job === null)

    await boss.stop()
  })

  it('should publish job based on current minute in UTC', async function () {
    const queue = 'schedule-current-min-utc'

    const now = new Date()

    const currentMinute = now.getUTCMinutes()

    now.setUTCMinutes(currentMinute + 1)

    const nextMinute = now.getUTCMinutes()

    // using current and next minute because the clock is ticking
    const minuteExpression = `${currentMinute},${nextMinute}`

    const boss = await helper.start(this.test.bossConfig)

    await boss.schedule(queue, `${minuteExpression} * * * *`)

    await Promise.delay(ASSERT_DELAY)

    const job = await boss.fetch(queue)

    assert(job)

    await boss.stop()
  })

  it('should publish job based on current minute in a specified time zone', async function () {
    const queue = 'schedule-current-min-timezone'

    const tz = 'America/Los_Angeles'
    const moment = require('moment-timezone')
    const nowLocal = moment().tz(tz)

    const currentMinute = nowLocal.minutes()
    const currentHour = nowLocal.hours()

    nowLocal.minutes(currentMinute + 1)

    const nextMinute = nowLocal.minutes()
    const nextHour = nowLocal.hours()

    // using current and next minute because the clock is ticking
    const minute = `${currentMinute},${nextMinute}`
    const hour = `${currentHour},${nextHour}`

    const boss = await helper.start(this.test.bossConfig)

    await boss.schedule(queue, `${minute} ${hour} * * *`, null, { tz })

    await Promise.delay(ASSERT_DELAY)

    const job = await boss.fetch(queue)

    assert(job)

    await boss.stop()
  })

  it('should force a clock skew warning', async function () {
    const boss = new PgBoss({ ...this.test.bossConfig, __test__force_clock_skew_warning: true })

    let warningCount = 0

    const warningEvent = 'warning'
    const onWarning = (warning) => {
      assert(warning.message.includes('clock skew'))
      warningCount++
    }

    process.on(warningEvent, onWarning)

    await boss.start()

    process.removeListener(warningEvent, onWarning)

    assert.strictEqual(warningCount, 1)

    await boss.stop()
  })
})
