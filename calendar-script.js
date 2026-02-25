const configGroup = [
  {
    icsFileName: "calendar",
    icsName: "中国日历",
    type: {
      lunar: false,
      solarFestivals: true,
      solarOtherFestivals: false,
      lunarFestivals: true,
      lunarOtherFestivals: false,
      jieQi: true,
    },
    useApi: true
  }
]

const { SolarMonth } = require('./1.7.6/lunar.js')
const fs = require('fs')
const https = require('https')

const startYear = 2024
const endYear = process.env.END_YEAR

async function main() {
  for (const item of configGroup) {
    let multiDayHolidays = []
    
    if (item.useApi) {
      multiDayHolidays = await fetchMultiDayHolidays(startYear, endYear)
    } else {
      multiDayHolidays = item.multiDayHolidays || []
    }
    
    await begin(item.icsFileName, item.icsName, item.type, multiDayHolidays)
  }
}

async function fetchMultiDayHolidays(startYear, endYear) {
  const allHolidays = []
  
  for (let year = startYear; year <= endYear; year++) {
    try {
      const data = await fetchHolidayData(year)
      if (data.code === 0 && data.holiday) {
        const yearHolidays = convertToMultiDayHolidays(data.holiday)
        allHolidays.push(...yearHolidays)
      }
    } catch (error) {
      console.error(`获取${year}年假期数据失败:`, error)
    }
  }
  
  return allHolidays
}

function fetchHolidayData(year) {
  return new Promise((resolve, reject) => {
    const url = `https://timor.tech/api/holiday/year/${year}`
    
    https.get(url, (response) => {
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk
      })
      
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data)
          resolve(jsonData)
        } catch (error) {
          reject(error)
        }
      })
    }).on('error', (error) => {
      reject(error)
    })
  })
}

function convertToMultiDayHolidays(holidayData) {
  const holidayGroups = {}
  
  Object.values(holidayData).forEach(item => {
    if (item.holiday && item.name) {
      if (!holidayGroups[item.name]) {
        holidayGroups[item.name] = []
      }
      holidayGroups[item.name].push(item.date)
    }
  })
  
  const multiDayHolidays = []
  
  Object.entries(holidayGroups).forEach(([name, dates]) => {
    dates.sort()
    
    let startDate = dates[0]
    let prevDate = dates[0]
    
    for (let i = 1; i <= dates.length; i++) {
      const currentDate = dates[i]
      
      if (i === dates.length || !isConsecutiveDay(prevDate, currentDate)) {
        multiDayHolidays.push({
          name: name,
          startDate: startDate,
          endDate: prevDate
        })
        
        if (i < dates.length) {
          startDate = currentDate
        }
      }
      
      prevDate = currentDate
    }
  })
  
  return multiDayHolidays
}

function isConsecutiveDay(date1, date2) {
  if (!date1 || !date2) return false
  
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  
  const diffTime = d2 - d1
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  
  return diffDays === 1
}

async function begin(fileName, icsName, config, multiDayHolidays) {
  let result = []
  result.push(generateICSHeader(icsName))
  
  multiDayHolidays.forEach(holiday => {
    result.push(generateMultiDayICSItem(holiday.startDate, holiday.endDate, holiday.name))
  })
  
  let dateGroup = getYearMonth()
  dateGroup.forEach(date => {
    let solarMonth = SolarMonth.fromYm(date.year, date.month)
    var days = solarMonth.getDays();
    for (var i = 0, j = days.length; i < j; i++) {
      let day = days[i]
      let solarYear = day.getYear().toString()
      let solarMonth = day.getMonth().toString().padStart(2, '0')
      let solarDay = day.getDay().toString().padStart(2, '0')
      let solarDate = `${solarYear}${solarMonth}${solarDay}`
      let solarFestivals = day.getFestivals()
      let solarOtherFestivals = day.getOtherFestivals()
      let lunar = day.getLunar()
      let monthChinese = lunar.getMonthInChinese().toString()
      let dayChinese = lunar.getDayInChinese().toString()
      let lunarFestivals = lunar.getFestivals()
      let lunarOtherFestivals = lunar.getOtherFestivals()
      let lunarDate = `${monthChinese}月${dayChinese}`
      let lunarJieQi = lunar.getJieQi()
      
      const dateStr = `${solarYear}-${solarMonth}-${solarDay}`
      const isInMultiDayHoliday = multiDayHolidays.some(holiday => {
        return dateStr >= holiday.startDate && dateStr <= holiday.endDate
      })
      
      if (isInMultiDayHoliday) {
        continue
      }
      
      if (config.lunar) {
        result.push(generateICSItem(solarDate, lunarDate))
      }
      if (config.solarFestivals) {
        solarFestivals.forEach(festival => {
          result.push(generateICSItem(solarDate, festival))
        })
      }
      if (config.solarOtherFestivals) {
        solarOtherFestivals.forEach(festival => {
          result.push(generateICSItem(solarDate, festival))
        })
      }
      if (config.lunarFestivals) {
        lunarFestivals.forEach(festival => {
          result.push(generateICSItem(solarDate, festival))
        })
      }
      if (config.lunarOtherFestivals) {
        lunarOtherFestivals.forEach(festival => {
          result.push(generateICSItem(solarDate, festival))
        })
      }
      if (config.jieQi) {
        if (!!lunarJieQi) {
          result.push(generateICSItem(solarDate, lunarJieQi))
        }
      }
    }
  })
  result.push(generateICSFooter())

  const resultString = result.join("\n")

  fs.writeFile(`./${fileName}.ics`, resultString, err => {
    if (err) {
      console.error(err)
      return
    }
    console.log(`${fileName} -> 写入成功`)
  })
}

function getYearMonth() {
  let group = []
  for (let i = startYear; i <= endYear; i++) {
    for (let j = 1; j <= 12; j++) {
      group.push({ year: i, month: j })
    }
  }
  return group
}

function generateICSHeader(icsName) {
  return [
    "BEGIN:VCALENDAR",
    `PRODID:${icsName}`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsName}`,
    "X-WR-TIMEZONE:Asia/Shanghai",
    "X-APPLE-LANGUAGE:zh",
    "X-APPLE-REGION:CN",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "X-LIC-LOCATION:Asia/Shanghai",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ].join("\n")
}

function generateICSItem(dateString, title) {
  const cleanTitle = title.replace(/\s+/g, ' ').trim()
  
  return [
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${dateString}`,
    `DTEND;VALUE=DATE:${dateString}`,
    `DTSTAMP:${dateString}T000001`,
    `UID:${getUID(dateString)}`,
    `CREATED:${dateString}T000001`,
    "DESCRIPTION:",
    `SUMMARY:${cleanTitle}`,
    "CLASS:PUBLIC",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\n")
}

function generateMultiDayICSItem(startDate, endDate, title) {
  const formattedStartDate = startDate.replace(/-/g, '')
  const endDateObj = new Date(endDate)
  endDateObj.setDate(endDateObj.getDate() + 1)
  const formattedEndDate = endDateObj.toISOString().split('T')[0].replace(/-/g, '')
  
  const cleanTitle = title.replace(/\s+/g, ' ').trim()
  
  return [
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${formattedStartDate}`,
    `DTEND;VALUE=DATE:${formattedEndDate}`,
    `DTSTAMP:${formattedStartDate}T000001`,
    `UID:${getMultiDayUID(formattedStartDate)}`,
    `CREATED:${formattedStartDate}T000001`,
    "DESCRIPTION:",
    `SUMMARY:${cleanTitle}`,
    "CLASS:PUBLIC",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\n")
}

function generateICSFooter() {
  return "END:VCALENDAR"
}

function getUID(dateString) {
  return `${dateString}${Math.ceil(Math.random() * 10000)}`
}

function getMultiDayUID(dateString) {
  return `multi-${dateString}${Math.ceil(Math.random() * 10000)}`
}

main().catch(console.error)