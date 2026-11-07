export const sampleFeed = {
  evLocationsData: [
    {
      address: "3E RIVER VALLEY ROAD SINGAPORE 179024",
      name: "CLARKE QUAY",
      longtitude: 103.846728,
      latitude: 1.290314,
      postalCode: "179024",
      chargingPoints: [
        point("SP MOBILITY PTE. LTD.", "L4 49", "0", "Type 2", "0.7739", "AC", "7.4", "kWh", [["R114859D-001", "0"]]),
        point("SP MOBILITY PTE. LTD.", "L4 50", "0", "Type 2", "0.7739", "AC", "22", "kWh", [["R114861R-001", "0"]]),
        point("SP MOBILITY PTE. LTD.", "L4 51 & 52", "1", "Combo 2", "0.8611", "DC", "50", "kWh", [
          ["R114858R-001", "1"],
          ["R114858R-002", "1"],
        ]),
      ],
    },
    {
      address: "7 HOLLAND VILLAGE WAY SINGAPORE 275748",
      name: "ONE HOLLAND VILLAGE",
      longtitude: 103.794146,
      latitude: 1.311049,
      postalCode: "275748",
      chargingPoints: [
        point("TESLA MOTORS SINGAPORE PRIVATE LIMITED", "B2 Lot 415-418", "1", "Combo 2", "", "DC", "250", "", [
          ["R117721A-001", "1"],
          ["R117721A-002", "1"],
          ["R117721A-003", "1"],
          ["R117721A-004", "1"],
        ]),
        point("SP MOBILITY PTE. LTD.", "B1 195", "0", "Type 2", "0.7739", "AC", "22", "kWh", [["R110753A-001", "0"]]),
        point("SP MOBILITY PTE. LTD.", "B1 154", "1", "Type 2", "0.7739", "AC", "22", "kWh", [["R109684B-001", "1"]]),
        point("SP MOBILITY PTE. LTD.", "B1 191 , 192", "0", "Combo 2", "0.8611", "DC", "100", "kWh", [
          ["R109678A-001", "0"],
          ["R109678A-002", "0"],
        ]),
        point("SP MOBILITY PTE. LTD.", "B1 193 , 194", "1", "Combo 2", "0.8611", "DC", "100", "kWh", [
          ["R109681A-002", "1"],
          ["R109681A-001", "0"],
        ]),
        point("SP MOBILITY PTE. LTD.", "B1 196", "1", "Type 2", "0.7739", "AC", "22", "kWh", [["R110754E-001", "1"]]),
      ],
    },
    {
      address: "150 BUKIT TIMAH ROAD SINGAPORE 229846",
      name: "SHELL NEWTON HOPPER",
      longtitude: 103.843175,
      latitude: 1.311305,
      postalCode: "229846",
      chargingPoints: [
        {
          status: "1",
          operator: "SHELL SINGAPORE PTE. LTD.",
          position: "L01 INSIDE SHELL STATION",
          name: "SHELL NEWTON HOPPER",
          plugTypes: [
            plug("Type 2", "0.8000", "AC", "43", "kWh", [["R107742Z-002", "1"]]),
            plug("Combo 2", "0.8900", "DC", "50", "kWh", [["R107742Z-001", "1"]]),
          ],
        },
      ],
    },
    {
      address: "10 ANG MO KIO INDUSTRIAL PARK 2A SINGAPORE 568047",
      name: "AMK AUTOPOINT",
      longtitude: 103.868862,
      latitude: 1.376987,
      postalCode: "568047",
      chargingPoints: [
        point("CHARGE+ PTE. LTD.", "L1 294 & 295", "0", "Combo 2", "0.7280", "DC", "120", "kWh", [
          ["R106795K-001", "0"],
          ["R106795K-002", "0"],
        ]),
      ],
    },
    {
      address: "991 UPPER JURONG ROAD SINGAPORE 630991",
      name: "BLK 991 UPPER JURONG ROAD JURONG WEST JEWEL",
      longtitude: 103.692442,
      latitude: 1.335681,
      postalCode: "630991",
      chargingPoints: [
        point("CHARGE+ PTE. LTD.", "L3B 155 & 156", "1", "Type 2", "0.6290", "AC", "7.4", "kWh", [
          ["R112779B-001", "1"],
          ["R112779B-002", "1"],
        ]),
        point("CHARGE+ PTE. LTD.", "L3B 158 & 159", "0", "Type 2", "0.6290", "AC", "7.4", "kWh", [
          ["R112780E-001", "0"],
          ["R112780E-002", "0"],
        ]),
      ],
    },
    {
      address: "142A PASIR RIS STREET 11 SINGAPORE 511142",
      name: "BLK 142A PASIR RIS STREET 11 MULTI STOREY CAR PARK",
      longtitude: 103.959758,
      latitude: 1.362839,
      postalCode: "511142",
      chargingPoints: [
        point("STRIDES YTL PTE. LTD.", "L3A 128", "1", "Type 2", "0.6781", "AC", "7.4", "kWh", [["R122901R-001", "1"]]),
        point("STRIDES YTL PTE. LTD.", "L3A 127", "1", "Type 2", "0.6781", "AC", "7.4", "kWh", [["R122900G-001", "1"]]),
      ],
    },
    {
      address: "414 FERNVALE LINK SINGAPORE 790414",
      name: "BLK 414 FERNVALE LINK FERNVALE RIVERBOW",
      longtitude: 103.880083,
      latitude: 1.389649,
      postalCode: "790414",
      chargingPoints: [
        point("SHELL SINGAPORE PTE. LTD.", "L1 342", "100", "Type 2", "", "AC", "7", "", [["R127739B-001", ""]]),
        point("SHELL SINGAPORE PTE. LTD.", "B1 331", "1", "Type 2", "0.6900", "AC", "7", "kWh", [["R123381F-001", "1"]]),
        point("SHELL SINGAPORE PTE. LTD.", "B1 332", "0", "Type 2", "0.6900", "AC", "7", "kWh", [["R123382Z-001", "0"]]),
      ],
    },
    {
      address: "207A BISHAN STREET 23 SINGAPORE 571207",
      name: "BLK 207A BISHAN STREET 23",
      longtitude: 103.848309,
      latitude: 1.355154,
      postalCode: "571207",
      chargingPoints: [
        point("SP MOBILITY PTE. LTD.", "L3B 123", "1", "Type 2", "0.6976", "AC", "7.4", "kWh", [["R124122G-001", "1"]]),
        point("SP MOBILITY PTE. LTD.", "L3B 122", "1", "Type 2", "0.6976", "AC", "7.4", "kWh", [["R124121C-001", "1"]]),
      ],
    },
  ],
};

function point(operator, position, status, plugType, price, current, power, priceType, evIds) {
  return {
    status,
    operator,
    position,
    plugTypes: [plug(plugType, price, current, power, priceType, evIds)],
  };
}

function plug(plugType, price, current, powerRating, priceType, evIds) {
  return {
    plugType,
    price,
    current,
    powerRating,
    priceType,
    evIds: evIds.map(([evCpId, status]) => ({ evCpId, status })),
  };
}
