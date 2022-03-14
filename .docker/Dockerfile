FROM rust:1.59

RUN curl -fsSL https://deb.nodesource.com/setup_17.x | bash -

RUN apt-get update && \
    apt-get install -y \
        pkg-config \
        build-essential \
        libudev-dev \
        nodejs

ENV SOLANA_VERSION=1.9.12
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"

ENV ANCHOR_VERSION=0.22.1
RUN cargo install \
    --git https://github.com/project-serum/anchor \
    avm \
    --tag v${ANCHOR_VERSION} \
    --locked \
    --force \
    --quiet

RUN avm install ${ANCHOR_VERSION}

ENV SOLANA_RELEASE_PATH=/root/.local/share/solana/install/releases/${SOLANA_VERSION}/solana-release
ENV PATH="${SOLANA_RELEASE_PATH}/bin:${PATH}"

RUN solana --version
RUN corepack enable
RUN yarn add ts-mocha
