document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("themeToggle");
    toggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
    });
  
    const projects = [
      {
        title: "C++ City builder",
        description: "a city builder game made in c++ to showcase various design patterns was made with 6 other teammates for COS 214",
        imageUrl: "./img/projects/profile-photo.jpeg",
        repoUrl: "https://github.com/COS214-Project-2024/VScoders-and-the-Jetbrainstormers-Team-4"
      },
      {
        title: "Project 2",
        description: "Description for project 2",
        imageUrl: "./img/project2.jpg",
        repoUrl: "https://github.com/ShaydenNaidoo/project2"
      }
      // Add more projects as needed
    ];
  
    const projectCardsContainer = document.getElementById("project-cards-container");
  const modal = document.getElementById("project-modal");
  const modalImage = document.getElementById("modal-image");
  const modalTitle = document.getElementById("modal-title");
  const modalDescription = document.getElementById("modal-description");
  const modalDate = document.getElementById("modal-date");
  const modalCompany = document.getElementById("modal-company");
  const modalRepo = document.getElementById("modal-repo");
  const closeModal = document.getElementsByClassName("close")[0];

  projects.forEach(project => {
    const card = document.createElement("div");
    card.className = "project-card";

    card.innerHTML = `
      <img src="${project.imageUrl}" alt="${project.title}">
      <div class="card-content">
        <h3>${project.title}</h3>
        <p>${project.description}</p>
        <a href="${project.repoUrl}" target="_blank">View on GitHub</a>
      </div>
    `;

    card.addEventListener("click", () => {
      modalImage.src = project.imageUrl;
      modalTitle.textContent = project.title;
      modalDescription.textContent = project.description;
      modalDate.textContent = `Date: ${project.date}`;
      modalCompany.textContent = `Company: ${project.company}`;
      modalRepo.href = project.repoUrl;
      modal.style.display = "block";
    });

    projectCardsContainer.appendChild(card);
  });

  closeModal.addEventListener("click", () => {
    modal.style.display = "none";
  });

  window.addEventListener("click", (event) => {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  });
});