export function enhanceQuizzes(root) {
  if (!root) return;

  const content = root.innerHTML;

  const quizRegex =
    /\[QUIZ\]([\s\S]*?)\[QUIZ_answer:([\d,]+)\][\s\S]*?\[QUIZ_explanation:\]([\s\S]*?)\[QUIZ_END\]/g;

  let match;

  let index = 0;

  let newContent = content;

  while ((match = quizRegex.exec(content)) !== null) {
    const [fullMatch, optionsText, answerIndices, explanation] = match;

    let questionText = "";

    const questionMatch = optionsText.match(
      /\[QUIZ_question\]([\s\S]*?)(?=<ol>|<ul>|\d+\.|$)/i
    );

    let optionsHtml = optionsText;

    if (questionMatch && questionMatch[1]) {
      questionText = questionMatch[1].trim();

      // Remove leading <p> and trailing </p> if present
      questionText = questionText.replace(/^<p>/i, '').replace(/<\/p>$/i, '');

      optionsHtml = optionsText.replace(
        /\[QUIZ_question\][\s\S]*?(?=<ol>|<ul>|\d+\.|$)/i,
        ""
      );
    }

    let options = [];

    const tempDiv = document.createElement("div");

    tempDiv.innerHTML = optionsHtml;

    const liNodes = tempDiv.querySelectorAll("li");

    if (liNodes.length > 0) {
      options = Array.from(liNodes).map((li) => li.innerHTML.trim());
    } else {
      const optionsByLine = optionsHtml
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+\.\s+/.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, ""));

      options = optionsByLine;
    }

    if (options.length === 0) {
      continue;
    }

    const correctAnswers = answerIndices.split(',').map(x => x.trim());

    const isMulti = correctAnswers.length > 1;

    const quizId = `quiz-${index++}`;

    let questionHtml = '';

    if (questionText) {
      questionHtml = `<p class="tesla-quiz-question">${questionText}`;

      if (isMulti) questionHtml += ' <span class="tesla-quiz-multi-note">(Select all that apply)</span>';

      questionHtml += '</p>';
    }

    // Remove any trailing <p></p> after the questionHtml in optionsHtml
    optionsHtml = optionsHtml.replace(/^\s*<p><\/p>\s*/i, '');

    const quizHtml = `
      <div id="${quizId}" data-correct-answers="${correctAnswers.join(',')}" data-explanation="${explanation
      .trim()
      .replace(/"/g, "&quot;")}">
        <h3>Quiz</h3>
        ${questionHtml}
        <ul class="tesla-quiz-options">
          ${options
            .map(
              (option, i) => `
            <li>
              <label class="tesla-quiz-option">
                <input type="${isMulti ? 'checkbox' : 'radio'}" class="tesla-quiz-option-marker" id="${quizId}-option-${i + 1}" name="${quizId}" value="${i + 1}">
                <span class="tesla-quiz-option-text">${option}</span>
              </label>
            </li>
          `
            )
            .join("")}
        </ul>
        <div class="quiz-feedback" style="display: none;">
          <div class="quiz-result"></div>
          <div class="quiz-explanation"></div>
        </div>
      </div>
    `;

    newContent = newContent.replace(fullMatch, quizHtml);
  }

  if (newContent !== content) {
    root.innerHTML = newContent;

    setupQuizInteractions(root);
  }
}

function setupQuizInteractions(root) {
  root.querySelectorAll("div[id^='quiz-']").forEach((quiz) => {
    const correctAnswers = (quiz.getAttribute("data-correct-answers") || "").split(',').map(x => x.trim()).filter(Boolean);

    const explanation = quiz.getAttribute("data-explanation");

    const options = quiz.querySelectorAll("input.tesla-quiz-option-marker");

    const feedback = quiz.querySelector(".quiz-feedback");

    const resultElement = quiz.querySelector(".quiz-result");

    const explanationElement = quiz.querySelector(".quiz-explanation");

    const isMulti = correctAnswers.length > 1;

    function submitQuiz() {
      if (feedback.style.display === "block") return;

      let selected;

      if (isMulti) {
        selected = Array.from(options).filter(opt => opt.checked).map(opt => opt.value);
      } else {
        selected = Array.from(options).find(opt => opt.checked)?.value ? [Array.from(options).find(opt => opt.checked).value] : [];
      }

      feedback.style.display = "block";

      // Scroll to feedback and animate
      setTimeout(() => {
        feedback.scrollIntoView({ behavior: "smooth", block: "center" });

        feedback.classList.add("quiz-feedback-animate");

        setTimeout(() => feedback.classList.remove("quiz-feedback-animate"), 1200);
      }, 100);

      const isCorrect = selected.length === correctAnswers.length && selected.every(val => correctAnswers.includes(val)) && correctAnswers.every(val => selected.includes(val));

      if (isCorrect) {
        resultElement.innerHTML = "✅ Correct!";

        resultElement.className = "quiz-result quiz-correct";
      } else {
        resultElement.innerHTML = "❌ Incorrect";

        resultElement.className = "quiz-result quiz-incorrect";
      }

      explanationElement.innerHTML = explanation;

      options.forEach((opt) => {
        opt.disabled = true;

        const label = opt.closest("label");

        if (label) {
          label.classList.remove("quiz-correct-answer", "quiz-user-selected", "quiz-preselected", "quiz-wrong-answer");
        }

        // If selected and correct, green
        if (opt.checked && correctAnswers.includes(opt.value) && label) {
          label.classList.add("quiz-correct-answer");
        }
        // If selected and wrong, red
        else if (opt.checked && !correctAnswers.includes(opt.value) && label) {
          label.classList.add("quiz-wrong-answer");
        }
        // If not selected and correct, green border (optional, keep as is)
        // else if (!opt.checked && correctAnswers.includes(opt.value) && label) {
        //   label.classList.add("quiz-correct-answer");
        // }
        // If not selected and not correct, do nothing
      });
    }

    if (isMulti) {
      options.forEach((input) => {
        input.addEventListener("change", () => {
          if (feedback.style.display === "block") return;

          // Highlight selected options in orange before submission
          options.forEach((opt) => {
            const label = opt.closest("label");

            if (label) {
              label.classList.remove("quiz-preselected");
            }

            if (opt.checked && label) {
              label.classList.add("quiz-preselected");
            }
          });

          const currentChecked = Array.from(options).filter(opt => opt.checked).length;

          if (currentChecked === 2) {
            submitQuiz();
          }
        });
      });
    } else {
      options.forEach((input) => {
        input.addEventListener("change", () => {
          if (feedback.style.display === "block") return;

          submitQuiz();
        });
      });
    }
  });
}


/* Quiz styles live in v20/_aeco-dev/styles/components/exercises.css */
