


export const AwayGameRules = () => {
  return (
    <div className="flex flex-col gap-4 [&_li]:mt-4">
      <h3 className="text-2xl">
        Anmälan och avbokning
      </h3>
      <ul>
        <li>
          <h5 className="text-xl">Anmälan</h5>
          <p>
            Anmälan till bussar görs på hemsidan vastrasidan.se 
          </p>
        </li>
        <li>
          <h5 className="text-xl">Avbokning</h5>
          <p>
            Avbokning kan göras via länken i ditt mail du får som bekräftelse på bokningen.
            Pengarna återbetalas då inom 3 bankdagar.
            Avbokning kan göras senast 36 timmar innan avresa. 
            Allmän information och ordningsregler
          </p>
        </li>
      </ul>
      <h3 className="text-2xl">
        Allmän information och ordningsregler
      </h3>
      <ul>
        <li>
          <h5 className="text-xl">Avresa</h5>
          <p>
            Bussarna åker alltid från Uppsala Konsert och Kongress (UKK), samt stannar där när
            bussen är framme i Uppsala igen. Var alltid på plats 15 minuter innan avresa. Passerar
            bussen via Stockholm stannar den vid Västbergarondellen och möjliggör på- och
            avstigning, meddela detta i anmälan. Var alltid på plats 45 minuter efter avresa från
            Uppsala
          </p>
        </li>
        <li>
          <h5 className="text-xl">Bussbiljett</h5>
          <p>
            Biljett för resan är det mail du får när du bokar dig.
            Bussvärden på bussen har alltid en lista med alla anmälda och ser till så att ingen går på fel buss.
          </p>
        </li>
        <li>
          <h5 className="text-xl">Matchbiljett</h5>
          <p>
            Matchbiljett ingår aldrig i priset, den ansvarar du för att införskaffa själv om inget annat
            kommuniceras.
          </p>
        </li>
        <li>
          <h5 className="text-xl">Plats på bussen</h5>
          <p>
            Det är fri placering på bussen och du kan lämna kvar dina saker på din plats tills hemresan.
            Dock så ansvarar inte Västra Sidan eller Högbergs Buss för värdesaker.
          </p>
        </li>
        <li>
          <h5 className="text-xl">Matstopp</h5>
          <p>
            Vid längre resor planerar vi alltid in matstopp. Den informationen står på sidan där du
            anmäler dig.
          </p>
        </li>
        <li>
          <h5 className="text-xl">Alkohol</h5>
          <p>
            Det är tillåtet att dricka medhavd alkohol på våra resor.
          </p>
        </li>
      </ul>
    </div>
  )
}