import { describe, expect, it } from "vitest";
import { isTrainEvent } from "~/utils/transport";
import { publicCaller } from "../helpers/caller";
import { createEvent, createParticipant, participantInput } from "../helpers/factories";
import { bookAndPay } from "../helpers/flows";
import { getSentEmails } from "../mocks/ses";

// React Email puts <!-- --> between adjacent text nodes
const sentEmailText = () => getSentEmails()[0]?.html?.replaceAll("<!-- -->", "");

describe("train trips", () => {
  it.each([
    { name: "Hammarby - Sirius (tåg)", description: "Avgång från Uppsala C" },
    { name: "Tåg till Malmö", description: "" },
    { name: "Malmö - Sirius", description: "Vi åker tåget från Uppsala C" },
    { name: "Malmö - Sirius", description: "Tågresa, samling 07:30" },
    { name: "Malmö - Sirius", description: "TÅG!" }
  ])("is a train trip when the name or description mentions tåg: $name / $description", (event) => {
    expect(isTrainEvent(event)).toBe(true);
  });

  it.each([
    { name: "Hammarby - Sirius", description: "Avgång från UKK" },
    { name: "Malmö - Sirius", description: "Avtåg från puben efter matchen" }
  ])("is a bus trip otherwise: $name / $description", (event) => {
    expect(isTrainEvent(event)).toBe(false);
  });

  it("says Tåg in the confirmation email of a train trip", async () => {
    const event = await createEvent({ name: "Malmö - Sirius (tåg)", buses: [{ name: "Vagn 3", seats: 10 }] });

    await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);

    expect(sentEmailText()).toContain("Tåg: Vagn 3");
    expect(sentEmailText()).not.toContain("Buss:");
  });

  it("says Buss in the confirmation email of a bus trip", async () => {
    const event = await createEvent({ buses: [{ name: "Buss 1", seats: 10 }] });

    await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);

    expect(sentEmailText()).toContain("Buss: Buss 1");
  });

  it("tells the manage-booking page whether the trip is by train", async () => {
    const train = await createEvent({ description: "Vi åker tåg från Uppsala C" });
    const bus = await createEvent();
    const trainTraveller = await createParticipant({ eventId: train.id, busId: train.buses[0]!.id });
    const busTraveller = await createParticipant({ eventId: bus.id, busId: bus.buses[0]!.id });

    const trainBooking = await publicCaller().eventPayment.getManagableBooking({
      token: trainTraveller.cancellationToken!
    });
    const busBooking = await publicCaller().eventPayment.getManagableBooking({
      token: busTraveller.cancellationToken!
    });

    expect(trainBooking.isTrain).toBe(true);
    expect(busBooking.isTrain).toBe(false);
  });
});
